import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { folioTotals, hotelDateKey, lockAndCheckRoom, notifyReceptionStaff } from '@/server/reception';
import { canCheckout } from '@/features/reception/domain';
import { siestaEndAt } from '@/features/reception/domain';

export const instant = false;

const actionSchema = z.object({
  action: z.enum(['confirm', 'cancel', 'check-in', 'check-out']),
  actualCheckInAt: z.string().datetime({ offset: true }).optional(),
  correctionReason: z.string().trim().min(8).max(500).optional(),
}).superRefine((value, context) => {
  if (value.action !== 'check-in' && (value.actualCheckInAt || value.correctionReason)) {
    context.addIssue({ code: 'custom', message: 'Une correction d’arrivée ne s’applique qu’au check-in.' });
  }
  if (value.actualCheckInAt && !value.correctionReason) {
    context.addIssue({ code: 'custom', path: ['correctionReason'], message: 'Justification obligatoire pour corriger l’heure réelle.' });
  }
  if (!value.actualCheckInAt && value.correctionReason) {
    context.addIssue({ code: 'custom', path: ['actualCheckInAt'], message: 'L’heure corrigée est obligatoire avec sa justification.' });
  }
});

const requiredPermission = {
  confirm: 'reservations.confirm',
  cancel: 'reservations.cancel',
  'check-in': 'stays.checkin',
  'check-out': 'stays.checkout',
} as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Action de réservation invalide.' }, { status: 400 });
    const { action, actualCheckInAt: correctedArrival, correctionReason } = parsed.data;
    const scope = await authorizedScope(requiredPermission[action]);
    if (correctedArrival) await authorizedScope('stays.checkin.correct');
    const configuration = await hotelConfiguration();
    const { id } = await params;
    const result = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM Reservation WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) throw new AppError(404, 'Réservation introuvable.');

      const reservation = await tx.reservation.findFirst({
        where: { id },
        include: {
          room: true,
          folio: { include: { lines: { select: { amount: true } }, payments: { select: { amount: true } }, invoice: true } },
          stay: true,
        },
      });
      if (!reservation) throw new AppError(404, 'Réservation introuvable dans cet établissement.');
      if (scope.roleCode === 'HOTEL_ADMIN' && (!reservation.roomId || !(await tx.room.findFirst({ where: { id: reservation.roomId, assignedHotelAdminId: scope.userId }, select: { id: true } })))) {
        throw new AppError(404, 'Réservation introuvable dans votre périmètre de chambres.');
      }
      const before = reservation.status;
      let folio = reservation.folio;
      if ((action === 'cancel' || action === 'check-out') && folio) {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM Folio WHERE id = ${folio.id} FOR UPDATE
        `;
        folio = await tx.folio.findFirst({
          where: { id: folio.id },
          include: { lines: { select: { amount: true } }, payments: { select: { amount: true } }, invoice: true },
        });
      }

      if (action === 'confirm') {
        if (reservation.status !== 'PENDING') throw new AppError(409, 'Seule une réservation en attente peut être confirmée.');
        const updated = await tx.reservation.update({ where: { id }, data: { status: 'CONFIRMED' } });
        await tx.auditLog.create({
          data: { actorId: scope.userId, action: 'RECEPTION_RESERVATION_CONFIRM', result: 'SUCCESS', targetId: id, details: { before, after: updated.status } },
        });
        return { status: updated.status };
      }

      if (action === 'cancel') {
        if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) throw new AppError(409, 'Cette réservation ne peut plus être annulée depuis la réception.');
        if (folio?.invoice) throw new AppError(409, 'Une facture a été émise. Utilisez la procédure de correction autorisée.');
        if (folio && folioTotals(folio).paid.gt(0)) {
          throw new AppError(409, 'Un paiement existe. Un remboursement autorisé est requis avant l\u2019annulation.');
        }
        const updated = await tx.reservation.update({ where: { id }, data: { status: 'CANCELLED' } });
        if (folio) {
          await tx.folio.update({
            where: { id: folio.id },
            data: { status: 'CLOSED', closedAt: new Date() },
          });
        }
        await notifyReceptionStaff(
          tx,
          [reservation.createdBy],
          `Réservation ${reservation.reference} annulée par ${scope.name}.`,
          scope.userId,
        );
        await tx.auditLog.create({
          data: { actorId: scope.userId, action: 'RECEPTION_RESERVATION_CANCEL', result: 'SUCCESS', targetId: id, details: { before, after: updated.status } },
        });
        return { status: updated.status };
      }

      if (action === 'check-in') {
        if (reservation.status !== 'CONFIRMED') throw new AppError(409, 'Confirmez la réservation avant le check-in.');
        if (!reservation.roomId) {
          throw new AppError(409, 'Attribuez une chambre avant le check-in.');
        }
        const today = hotelDateKey(new Date(), configuration.timezone);
        const checkInDate = reservation.checkInDate.toISOString().slice(0, 10);
        const checkOutDate = reservation.checkOutDate.toISOString().slice(0, 10);
        if (reservation.stayType === 'SIESTA'
          ? today !== checkInDate
          : today < checkInDate || today >= checkOutDate) {
          throw new AppError(409, 'Le check-in est autorisé uniquement pendant la période du séjour.');
        }

        const recordedAt = new Date();
        const actualCheckInAt = correctedArrival ? new Date(correctedArrival) : recordedAt;
        const actualDate = hotelDateKey(actualCheckInAt, configuration.timezone);
        if (actualCheckInAt > recordedAt || actualDate !== checkInDate) {
          throw new AppError(400, 'L’heure réelle d’arrivée doit être passée et correspondre à la date prévue.');
        }
        const expectedCheckOutAt = reservation.stayType === 'SIESTA'
          ? siestaEndAt(actualCheckInAt)
          : reservation.plannedCheckOutAt;

        const room = await lockAndCheckRoom(
          tx,
          reservation.roomId,
          reservation.checkInDate,
          reservation.checkOutDate,
          {
            excludeReservationId: reservation.id,
            ...(expectedCheckOutAt ? {
              plannedCheckInAt: actualCheckInAt,
              plannedCheckOutAt: expectedCheckOutAt,
            } : {}),
          },
        );
        if (room.status !== 'AVAILABLE') throw new AppError(409, 'La chambre doit être disponible et prête pour le check-in.');
        await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
        await tx.stay.create({
          data: {
            reservationId: reservation.id,
            roomId: room.id,
            checkedInAt: actualCheckInAt,
            checkInRecordedAt: recordedAt,
            expectedCheckOutAt,
            checkedInBy: scope.userId,
          },
        });
        const updated = await tx.reservation.update({
          where: { id },
          data: { status: 'CHECKED_IN', checkedInAt: actualCheckInAt },
        });
        await tx.auditLog.create({
          data: {
            actorId: scope.userId,
            action: correctedArrival ? 'RECEPTION_STAY_CHECK_IN_CORRECTED' : 'RECEPTION_STAY_CHECK_IN',
            result: 'SUCCESS',
            targetId: id,
            details: {
              before,
              after: updated.status,
              roomId: room.id,
              actualCheckInAt: actualCheckInAt.toISOString(),
              recordedAt: recordedAt.toISOString(),
              expectedCheckOutAt: expectedCheckOutAt?.toISOString() ?? null,
              correctionReason: correctionReason ?? null,
            },
          },
        });
        return {
          status: updated.status,
          checkedInAt: updated.checkedInAt,
          checkInRecordedAt: recordedAt,
          expectedCheckOutAt,
        };
      }

      if (reservation.status !== 'CHECKED_IN' || !reservation.roomId || !reservation.stay || !folio) {
        throw new AppError(409, 'Ce séjour ne peut pas être clôturé.');
      }
      if (!folio.invoice) throw new AppError(409, 'Émettez la facture avant le check-out.');
      const totals = folioTotals(folio);
      if (!canCheckout(totals.balance.mul(100).toNumber(), configuration.allowCheckoutWithBalance)) {
        throw new AppError(409, `Le solde de ${totals.balance.toFixed(2)} reste à encaisser avant le check-out.`);
      }

      const now = new Date();
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM Room WHERE id = ${reservation.roomId} FOR UPDATE
      `;
      await tx.stay.update({
        where: { id: reservation.stay.id },
        data: { checkedOutAt: now, checkOutRecordedAt: now, checkedOutBy: scope.userId },
      });
      await tx.reservation.update({ where: { id }, data: { status: 'CHECKED_OUT', checkedOutAt: now } });
      await tx.room.update({
        where: { id: reservation.roomId },
        data: { status: 'DIRTY', housekeepingStatus: 'TO_CLEAN' },
      });
      await tx.folio.update({ where: { id: folio.id }, data: { status: 'CLOSED', closedAt: now } });
      await tx.housekeepingTask.create({
        data: {
          roomId: reservation.roomId,
          reservationId: id,
          createdBy: scope.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_STAY_CHECK_OUT',
          result: 'SUCCESS',
          targetId: id,
          details: { before, after: 'CHECKED_OUT', balance: totals.balance.toFixed(2), housekeeping: 'PENDING' },
        },
      });
      return { status: 'CHECKED_OUT' };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

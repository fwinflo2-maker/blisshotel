import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { countNights, hotelDateKey, lockAndCheckRoom, notifyReceptionStaff, parseDateOnly, parseHotelDateTime } from '@/server/reception';
import { Prisma } from '@prisma/client';
import { nightlyRatePolicy } from '@/features/reception/domain';
import { convertToXaf } from '@/server/currency';

export const instant = false;

const updateSchema = z.object({
  action: z.enum(['update', 'extend', 'occupants', 'move']).default('update'),
  roomId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  agreedRate: z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/).optional(),
  rateReason: z.string().trim().max(500).optional(),
  adults: z.number().int().min(1).max(2147483647).optional(),
  children: z.number().int().min(0).max(2147483647).optional(),
}).refine((value) => value.action === 'extend'
  ? Boolean(value.checkOutDate) && !value.roomId && !value.clientId && !value.checkInDate && value.adults === undefined && value.children === undefined
  : value.action === 'occupants'
    ? value.adults !== undefined && value.children !== undefined && !value.roomId && !value.clientId && !value.checkInDate && !value.checkOutDate
    : value.action === 'move'
      ? Boolean(value.roomId) && !value.clientId && !value.checkInDate && !value.checkOutDate && value.adults === undefined && value.children === undefined
  : Boolean(value.roomId || value.clientId || value.checkInDate || value.checkOutDate || value.agreedRate || value.adults !== undefined || value.children !== undefined));

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Modification de réservation invalide.' }, { status: 400 });
    const { action, ...changes } = parsed.data;
    const scope = await authorizedScope(action === 'update' || action === 'move' ? 'reservations.update' : 'stays.extend');
    const { id } = await params;
    const configuration = await hotelConfiguration();
    const currentRate = changes.agreedRate
      ? await db.reservation.findUnique({
        where: { id },
        select: { nightlyRate: true, inputNightlyRate: true, inputCurrency: true },
      })
      : null;
    if (changes.agreedRate && !currentRate) throw new AppError(404, 'Réservation introuvable.');
    const agreedRateIsUnchanged = Boolean(currentRate && changes.agreedRate
      && (currentRate.inputNightlyRate ?? currentRate.nightlyRate).equals(changes.agreedRate)
      && (currentRate.inputCurrency ?? 'XAF') === configuration.currency);
    const convertedAgreedRate = changes.agreedRate
      ? agreedRateIsUnchanged && currentRate
        ? currentRate.nightlyRate
        : await convertToXaf(changes.agreedRate, configuration.currency)
      : null;
    const reservation = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM Reservation WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) throw new AppError(404, 'Réservation introuvable.');
      const before = await tx.reservation.findFirst({
        where: { id },
        include: {
          room: { include: { category: true } },
          folio: { include: { payments: { select: { amount: true } }, invoice: true } },
          stay: true,
        },
      });
      if (!before) throw new AppError(404, 'Réservation introuvable dans cet établissement.');
      if (scope.roleCode === 'HOTEL_ADMIN' && (!before.roomId || !(await tx.room.findFirst({ where: { id: before.roomId, assignedHotelAdminId: scope.userId }, select: { id: true } })))) {
        throw new AppError(404, 'Réservation introuvable dans votre périmètre de chambres.');
      }
      let folio = before.folio;
      if (action !== 'occupants' && action !== 'move' && folio) {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM Folio WHERE id = ${folio.id} FOR UPDATE
        `;
        folio = await tx.folio.findFirst({
          where: { id: folio.id },
          include: { payments: { select: { amount: true } }, invoice: true },
        });
      }

      if (action === 'occupants') {
        if (before.status !== 'CHECKED_IN' || !before.room || changes.adults === undefined || changes.children === undefined) {
          throw new AppError(409, 'Les occupants ne peuvent être modifiés que pendant un séjour en cours.');
        }
        if (before.room.category.capacity !== null && changes.adults + changes.children > before.room.category.capacity) {
          throw new AppError(400, 'Le nombre d\u2019occupants dépasse la capacité de la chambre.');
        }
        const updated = await tx.reservation.update({
          where: { id },
          data: { adults: changes.adults, children: changes.children },
        });
        await tx.auditLog.create({
          data: {
            actorId: scope.userId,
            action: 'RECEPTION_STAY_OCCUPANTS_UPDATE',
            result: 'SUCCESS',
            targetId: id,
            details: {
              before: { adults: before.adults, children: before.children },
              after: { adults: updated.adults, children: updated.children },
            },
          },
        });
        return { id: updated.id, adults: updated.adults, children: updated.children };
      }

      if (action === 'extend') {
        if (before.status !== 'CHECKED_IN' || !before.roomId || !before.room || !folio || !changes.checkOutDate) {
          throw new AppError(409, 'Seul un séjour en cours peut être prolongé.');
        }
        if (before.stayType === 'SIESTA') {
          throw new AppError(409, 'La prolongation d’une sieste nécessite un tarif dédié configuré par l’administration.');
        }
        if (folio.invoice) throw new AppError(409, 'La facture est émise. Une correction autorisée est requise.');
        if (!configuration.checkOutTime) throw new AppError(409, 'L’heure conventionnelle de départ doit être configurée.');
        const checkOutDate = parseDateOnly(changes.checkOutDate);
        const plannedCheckOutAt = parseHotelDateTime(`${changes.checkOutDate}T${configuration.checkOutTime}`, configuration.timezone);
        const previousCheckOut = before.checkOutDate;
        if (checkOutDate <= previousCheckOut) throw new AppError(400, 'La nouvelle date de départ doit prolonger le séjour.');
        const totalNights = countNights(before.checkInDate, checkOutDate);
        if (totalNights > 365 || hotelDateKey(new Date(), configuration.timezone) >= checkOutDate.toISOString().slice(0, 10)) {
          throw new AppError(400, 'La nouvelle date de départ est invalide.');
        }
        await lockAndCheckRoom(tx, before.roomId, previousCheckOut, checkOutDate, {
          excludeReservationId: id,
          allowDirtyForFuture: true,
          ...(before.stay?.checkedInAt ? {
            plannedCheckInAt: before.stay.checkedInAt,
            plannedCheckOutAt,
          } : before.plannedCheckInAt ? {
            plannedCheckInAt: before.plannedCheckInAt,
            plannedCheckOutAt,
          } : {}),
        });
        const addedNights = countNights(previousCheckOut, checkOutDate);
        const extensionAmount = before.nightlyRate.mul(addedNights).toDecimalPlaces(2);
        const updated = await tx.reservation.update({
          where: { id },
          data: { checkOutDate, plannedCheckOutAt, totalAmount: before.totalAmount.add(extensionAmount) },
        });
        if (before.stay) {
          await tx.stay.update({ where: { id: before.stay.id }, data: { expectedCheckOutAt: plannedCheckOutAt } });
        }
        await tx.folioLine.create({
          data: {
            folioId: folio.id,
            type: 'ACCOMMODATION',
            description: `Prolongation · ${addedNights} nuit${addedNights > 1 ? 's' : ''}`,
            amount: extensionAmount,
            createdBy: scope.userId,
          },
        });
        await notifyReceptionStaff(
          tx,
          [scope.userId, before.createdBy],
          `Séjour ${before.reference} prolongé de ${addedNights} nuit${addedNights > 1 ? 's' : ''} dans la chambre ${before.room.number} · ${extensionAmount.toFixed(2)} FCFA ajoutés au folio et à encaisser.`,
        );
        await tx.auditLog.create({
          data: {
            actorId: scope.userId,
            action: 'RECEPTION_STAY_EXTEND',
            result: 'SUCCESS',
            targetId: id,
            details: {
              before: previousCheckOut.toISOString().slice(0, 10),
              after: checkOutDate.toISOString().slice(0, 10),
              addedNights,
              addedAmount: extensionAmount.toFixed(2),
            },
          },
        });
        return {
          id: updated.id,
          reference: updated.reference,
          status: updated.status,
          checkOutDate: updated.checkOutDate.toISOString().slice(0, 10),
          totalAmount: updated.totalAmount.toFixed(2),
        };
      }

      if (action === 'move') {
        if (before.status !== 'CHECKED_IN' || !before.roomId || !before.room || !before.stay) {
          throw new AppError(409, 'Seul un séjour en cours peut être changé de chambre.');
        }
        if (!changes.roomId || changes.roomId === before.roomId) {
          throw new AppError(400, 'Choisissez une autre chambre que la chambre actuelle.');
        }
        if (scope.roleCode === 'HOTEL_ADMIN' && !(await tx.room.findFirst({ where: { id: changes.roomId, assignedHotelAdminId: scope.userId }, select: { id: true } }))) {
          throw new AppError(404, 'Chambre de destination introuvable dans votre périmètre.');
        }
        const now = new Date();
        const remainingEnd = before.stay.expectedCheckOutAt ?? before.plannedCheckOutAt ?? before.checkOutDate;
        const today = parseDateOnly(hotelDateKey(now, configuration.timezone));
        const newRoom = await lockAndCheckRoom(tx, changes.roomId, today, before.checkOutDate, {
          excludeReservationId: id,
          plannedCheckInAt: now,
          plannedCheckOutAt: remainingEnd,
        });
        if (newRoom.status !== 'AVAILABLE') throw new AppError(409, 'La chambre de destination doit être disponible et propre.');
        await tx.room.update({ where: { id: before.roomId }, data: { status: 'DIRTY', housekeepingStatus: 'TO_CLEAN' } });
        await tx.room.update({ where: { id: newRoom.id }, data: { status: 'OCCUPIED' } });
        await tx.housekeepingTask.create({
          data: { roomId: before.roomId, reservationId: id, createdBy: scope.userId },
        });
        const updated = await tx.reservation.update({ where: { id }, data: { roomId: newRoom.id } });
        await tx.stay.update({ where: { id: before.stay.id }, data: { roomId: newRoom.id } });
        await notifyReceptionStaff(
          tx,
          [before.createdBy],
          `Chambre de la réservation ${before.reference} changée : ${before.room.number} → ${newRoom.number} par ${scope.name}.`,
          scope.userId,
        );
        await tx.auditLog.create({
          data: {
            actorId: scope.userId,
            action: 'RECEPTION_ROOM_MOVE',
            result: 'SUCCESS',
            targetId: id,
            details: {
              before: { roomId: before.roomId, roomNumber: before.room.number },
              after: { roomId: newRoom.id, roomNumber: newRoom.number },
            },
          },
        });
        return {
          id: updated.id,
          reference: updated.reference,
          room: { id: newRoom.id, number: newRoom.number },
        };
      }

      if (!['PENDING', 'CONFIRMED'].includes(before.status)) throw new AppError(409, 'Une réservation commencée ou terminée ne peut plus être modifiée.');
      if (before.stayType === 'SIESTA' && (changes.checkInDate || changes.checkOutDate || changes.clientId)) {
        throw new AppError(409, 'La modification de l’horaire d’une sieste n’est pas disponible après sa création.');
      }
      if (before.stayType === 'OVERNIGHT' && !configuration.checkOutTime) {
        throw new AppError(409, 'L’heure conventionnelle de départ doit d’abord être configurée.');
      }
      if (folio?.invoice || folio?.payments.length) {
        throw new AppError(409, 'Une facture ou un paiement existe. Utilisez la procédure de correction autorisée.');
      }

      const checkInDate = changes.checkInDate ? parseDateOnly(changes.checkInDate) : before.checkInDate;
      const checkOutDate = changes.checkOutDate ? parseDateOnly(changes.checkOutDate) : before.checkOutDate;
      const nights = countNights(checkInDate, checkOutDate);
      const plannedCheckInAt = before.stayType === 'SIESTA'
        ? before.plannedCheckInAt!
        : parseHotelDateTime(
          `${checkInDate.toISOString().slice(0, 10)}T${configuration.checkOutTime}`,
          configuration.timezone,
        );
      const plannedCheckOutAt = before.stayType === 'SIESTA'
        ? before.plannedCheckOutAt!
        : parseHotelDateTime(
          `${checkOutDate.toISOString().slice(0, 10)}T${configuration.checkOutTime}`,
          configuration.timezone,
        );
      if ((before.stayType === 'OVERNIGHT' && (!nights || nights > 365))
        || hotelDateKey(new Date(), configuration.timezone) > checkInDate.toISOString().slice(0, 10)) {
        throw new AppError(400, 'La période doit durer de 1 à 365 nuits et ne peut pas commencer dans le passé.');
      }
      if (plannedCheckOutAt <= plannedCheckInAt) throw new AppError(400, 'Les heures configurées produisent une période invalide.');

      const roomId = changes.roomId ?? before.roomId;
      if (!roomId) throw new AppError(409, 'Attribuez une chambre avant de modifier les détails du séjour.');
      if (scope.roleCode === 'HOTEL_ADMIN' && !(await tx.room.findFirst({ where: { id: roomId, assignedHotelAdminId: scope.userId }, select: { id: true } }))) {
        throw new AppError(404, 'Chambre introuvable dans votre périmètre.');
      }
      const room = await lockAndCheckRoom(tx, roomId, checkInDate, checkOutDate, {
        excludeReservationId: id,
        allowDirtyForFuture: checkInDate.toISOString().slice(0, 10) > hotelDateKey(new Date(), configuration.timezone),
        plannedCheckInAt,
        plannedCheckOutAt,
      });
      const adults = changes.adults ?? before.adults;
      const children = changes.children ?? before.children;
      if (room.category.capacity !== null && adults + children > room.category.capacity) {
        throw new AppError(400, 'Le nombre d\u2019occupants dépasse la capacité de la chambre.');
      }

      if (changes.clientId) {
        const client = await tx.client.findFirst({ where: { id: changes.clientId }, select: { id: true } });
        if (!client) throw new AppError(404, 'Client introuvable.');
      }

      const nightlyRate = convertedAgreedRate
        ? convertedAgreedRate
        : roomId === before.roomId
          ? before.nightlyRate
          : room.nightlyRateMin ?? room.category.nightlyRate;
      if (!nightlyRate.gt(0)) throw new AppError(400, 'Le tarif convenu doit être supérieur à zéro.');
      const ratePolicy = nightlyRatePolicy(
        (room.nightlyRateMin ?? room.category.nightlyRate).toFixed(2),
        (room.nightlyRateMax ?? room.category.nightlyRate).toFixed(2),
      );
      const outsideRange = before.stayType === 'OVERNIGHT'
        && (nightlyRate.lt(ratePolicy.minimum) || nightlyRate.gt(ratePolicy.maximum));
      const rateReason = changes.rateReason === undefined ? before.rateReason : changes.rateReason || null;
      if (outsideRange && !rateReason) {
        throw new AppError(400, 'Une justification est obligatoire pour un tarif hors de la fourchette autorisée.');
      }
      const totalAmount = before.stayType === 'SIESTA'
        ? nightlyRate
        : nightlyRate.mul(nights).toDecimalPlaces(2);
      if (totalAmount.gt('99999999.99')) {
        throw new AppError(400, 'Le total du séjour dépasse la limite comptable autorisée en XAF.');
      }
      const updated = await tx.reservation.update({
        where: { id },
        data: {
          roomId,
          clientId: changes.clientId,
          checkInDate,
          checkOutDate,
          plannedCheckInAt,
          plannedCheckOutAt,
          adults,
          children,
          nightlyRate,
          ...(changes.agreedRate
            ? { inputNightlyRate: new Prisma.Decimal(changes.agreedRate), inputCurrency: configuration.currency }
            : roomId !== before.roomId
              ? { inputNightlyRate: nightlyRate, inputCurrency: 'XAF' }
              : {}),
          rateReason,
          totalAmount,
        },
        include: {
          room: { include: { category: true } },
          client: { select: { id: true, name: true } },
        },
      });
      if (folio) {
        const accommodationLine = await tx.folioLine.findFirst({
          where: { folioId: folio.id, type: 'ACCOMMODATION' },
          select: { id: true },
        });
        const lineData = {
          description: before.stayType === 'SIESTA'
            ? 'Sieste · 3 h 30'
            : `Hébergement · ${nights} nuit${nights > 1 ? 's' : ''}`,
          amount: totalAmount,
        };
        if (accommodationLine) {
          await tx.folioLine.update({ where: { id: accommodationLine.id }, data: lineData });
        } else {
          await tx.folioLine.create({
            data: { folioId: folio.id, type: 'ACCOMMODATION', ...lineData, createdBy: scope.userId },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_RESERVATION_UPDATE',
          result: 'SUCCESS',
          targetId: id,
          details: {
            before: {
              roomId: before.roomId,
              checkInDate: before.checkInDate.toISOString().slice(0, 10),
              checkOutDate: before.checkOutDate.toISOString().slice(0, 10),
              totalAmount: before.totalAmount.toFixed(2),
              nightlyRate: before.nightlyRate.toFixed(2),
            },
            after: {
              roomId: updated.roomId,
              checkInDate: updated.checkInDate.toISOString().slice(0, 10),
              checkOutDate: updated.checkOutDate.toISOString().slice(0, 10),
              totalAmount: updated.totalAmount.toFixed(2),
              nightlyRate: updated.nightlyRate.toFixed(2),
            },
          },
        },
      });
      return {
        id: updated.id,
        reference: updated.reference,
        status: updated.status,
        client: updated.client,
        room: updated.room
          ? { id: updated.room.id, number: updated.room.number, category: updated.room.category.name }
          : null,
        checkInDate: updated.checkInDate.toISOString().slice(0, 10),
        checkOutDate: updated.checkOutDate.toISOString().slice(0, 10),
        adults: updated.adults,
        children: updated.children,
        totalAmount: updated.totalAmount.toFixed(2),
      };
    });

    return NextResponse.json({ reservation });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Une réservation identique existe déjà.' }, { status: 409 });
    }
    throw error;
  }
}

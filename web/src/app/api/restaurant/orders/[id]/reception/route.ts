import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { presentRestaurantOrder, restaurantOrderInclude } from '@/server/restaurant';

export const instant = false;

const decisionSchema = z.object({
  action: z.enum(['confirm', 'reject']),
  reservationId: z.string().min(1).optional(),
  reason: z.string().trim().min(3).max(500).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await authorizedScope('restaurant.folio.transfer');
    const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Décision de réception invalide.' }, { status: 400 });
    const { id } = await params;
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM RestaurantOrder WHERE id = ${id} FOR UPDATE`;
      const order = await tx.restaurantOrder.findUnique({ where: { id }, include: restaurantOrderInclude });
      if (!order) throw new AppError(404, 'Commande restaurant introuvable.');
      if (order.status !== 'PENDING_RECEPTION') throw new AppError(409, 'Cette commande a déjà été traitée par la réception.');

      if (parsed.data.action === 'reject') {
        const rejected = await tx.restaurantOrder.update({
          where: { id },
          data: { status: 'REJECTED', rejectedBy: scope.userId, rejectedByName: scope.name, rejectedAt: new Date() },
          include: restaurantOrderInclude,
        });
        await tx.notification.create({ data: { userId: order.createdBy, message: `La commande ${order.number} a été refusée par la réception.${parsed.data.reason ? ` Motif : ${parsed.data.reason}` : ''}` } });
        await tx.auditLog.create({
          data: { actorId: scope.userId, action: 'RESTAURANT_ORDER_REJECT', result: 'SUCCESS', targetId: id, details: { number: order.number, reason: parsed.data.reason } },
        });
        return rejected;
      }

      let reservationId = parsed.data.reservationId ?? order.reservationId ?? undefined;
      if (!reservationId && order.roomId) {
        const activeStays = await tx.stay.findMany({
          where: {
            roomId: order.roomId,
            checkedInAt: { lte: order.createdAt },
            checkedOutAt: null,
          },
          select: { reservationId: true },
          take: 2,
        });
        if (activeStays.length !== 1) {
          throw new AppError(409, activeStays.length
            ? 'Plusieurs sejours actifs sont associes a cette chambre. La consommation ne peut pas etre imputee sans ambiguite.'
            : `Aucun séjour actif au moment de la saisie pour la chambre ${order.room?.number ?? ''}. La commande doit être refusée : elle ne peut pas être imputée au séjour d’un autre client.`);
        }
        reservationId = activeStays[0].reservationId;
      }
      if (!reservationId) throw new AppError(409, 'Cette commande ne comporte pas de numero de chambre. Elle ne peut pas etre ajoutee a un folio.');
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM Reservation WHERE id = ${reservationId} FOR UPDATE`;
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { room: { select: { id: true, number: true } }, client: { select: { name: true } }, stay: true, folio: { include: { invoice: true } } },
      });
      if (!reservation || !reservation.stay || reservation.stay.checkedOutAt || !reservation.room) {
        throw new AppError(409, "Le client n'est plus enregistre dans cette chambre. Verifiez le sejour avant de confirmer.");
      }
      if (order.roomId && reservation.room.id !== order.roomId) throw new AppError(409, 'La chambre du sejour a change. Verifiez la commande avant de la confirmer.');
      if (!reservation.folio || reservation.folio.status !== 'OPEN' || reservation.folio.invoice) {
        throw new AppError(409, 'La facture du séjour est déjà émise ou le folio est clôturé.');
      }
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM Folio WHERE id = ${reservation.folio.id} FOR UPDATE`;
      const currentFolio = await tx.folio.findUnique({ where: { id: reservation.folio.id }, include: { invoice: true } });
      if (!currentFolio || currentFolio.status !== 'OPEN' || currentFolio.invoice) {
        throw new AppError(409, 'Le folio ne peut plus recevoir cette commande.');
      }
      const now = new Date();
      await tx.folioLine.create({
        data: {
          folioId: currentFolio.id,
          type: 'SERVICE',
          description: `Restaurant · commande ${order.number}`,
          amount: order.totalAmount,
          createdBy: scope.userId,
          restaurantOrderId: order.id,
        },
      });
      const confirmed = await tx.restaurantOrder.update({
        where: { id },
        data: { status: 'CONFIRMED', reservationId: reservation.id, roomId: reservation.room.id, guestName: reservation.client.name, confirmedBy: scope.userId, confirmedByName: scope.name, confirmedAt: now },
        include: restaurantOrderInclude,
      });
      await tx.notification.create({ data: { userId: order.createdBy, message: `La commande ${order.number} est confirmée et ajoutée au folio de la chambre ${reservation.room.number}.` } });
      await tx.auditLog.create({
        data: { actorId: scope.userId, action: 'RESTAURANT_ORDER_CONFIRM', result: 'SUCCESS', targetId: id, details: { number: order.number, folioId: currentFolio.id, amount: order.totalAmount.toFixed(2) } },
      });
      return confirmed;
    });
    return NextResponse.json({ order: presentRestaurantOrder(result) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

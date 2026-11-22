import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope, scopeFor } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { presentRestaurantOrder, restaurantOrderInclude } from '@/server/restaurant';

export const instant = false;

const requestedOrderItemSchema = z.union([
  z.object({
    menuItemId: z.string().min(1),
    quantity: z.coerce.number().int().min(1).max(99),
  }),
  z.object({
    name: z.string().trim().min(2).max(160),
    category: z.enum(['FOOD', 'DRINK', 'BREAKFAST']),
    quantity: z.coerce.number().int().min(1).max(99),
    unitPrice: z.coerce.number().finite().min(50).max(100000000),
  }),
]);

const createOrderSchema = z.object({
  reservationId: z.string().min(1),
  roomId: z.string().min(1),
  source: z.enum(['ROOM_SERVICE', 'RESTAURANT']),
  items: z.array(requestedOrderItemSchema).min(1).max(30),
  notes: z.string().trim().max(500).optional().default(''),
}).superRefine((value, context) => {
  const menuItemIds = value.items.flatMap((item) => 'menuItemId' in item ? [item.menuItemId] : []);
  if (new Set(menuItemIds).size !== menuItemIds.length) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'Un produit de la carte ne peut apparaître qu’une fois dans la commande.' });
  }
});

export async function GET(request: Request) {
  try {
    const scope = await scopeFor();
    if (!scope.permissions.includes('restaurant.orders.manage') && !scope.permissions.includes('restaurant.folio.transfer')) {
      throw new AppError(403, 'Vous ne pouvez pas consulter les commandes du restaurant.');
    }
    const pendingOnly = new URL(request.url).searchParams.get('pending') === 'true';
    const [orders, activeReservations, rooms] = await Promise.all([
      db.restaurantOrder.findMany({
        where: pendingOnly ? { status: 'PENDING_RECEPTION' } : {},
        include: restaurantOrderInclude,
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      }),
      db.reservation.findMany({
          where: { status: 'CHECKED_IN', roomId: { not: null }, stay: { is: { checkedOutAt: null } } },
          include: { room: { select: { id: true, number: true } }, client: { select: { name: true } }, stay: true, folio: { include: { invoice: true } } },
          orderBy: [{ checkOutDate: 'asc' }],
          take: 200,
        }),
      db.room.findMany({ select: { id: true, number: true }, orderBy: { number: 'asc' } }),
    ]);
    return NextResponse.json({
      orders: orders.map(presentRestaurantOrder),
      rooms,
      activeStays: activeReservations
        .filter((reservation) => reservation.room && reservation.folio?.status === 'OPEN' && !reservation.folio.invoice)
        .map((reservation) => ({
          reservationId: reservation.id,
          reference: reservation.reference,
          room: reservation.room!,
          guestName: reservation.client.name,
          nights: Math.max(1, Math.round((reservation.checkOutDate.getTime() - reservation.checkInDate.getTime()) / 86_400_000)),
          checkOutDate: reservation.checkOutDate.toISOString().slice(0, 10),
        })),
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const scope = await authorizedScope('restaurant.orders.manage');
    const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Vérifiez le séjour, les produits et les quantités.' }, { status: 400 });
    const { reservationId, roomId, source, notes, items } = parsed.data;
    const order = await db.$transaction(async (tx) => {
      let reservation = null;
      let selectedRoom = null;
      if (reservationId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM Reservation WHERE id = ${reservationId} FOR UPDATE`;
        reservation = await tx.reservation.findUnique({
          where: { id: reservationId },
          include: { room: true, client: true, stay: true, folio: { include: { invoice: true } } },
        });
        if (!reservation || reservation.status !== 'CHECKED_IN' || !reservation.room || !reservation.stay || reservation.stay.checkedOutAt) {
          throw new AppError(409, "Le sejour choisi n'est plus en cours. Actualisez la liste.");
        }
        if (roomId && reservation.room.id !== roomId) throw new AppError(409, 'La chambre selectionnee ne correspond pas au sejour choisi.');
        if (!reservation.folio || reservation.folio.status !== 'OPEN' || reservation.folio.invoice) {
          throw new AppError(409, 'Le folio du sejour choisi est ferme ou sa facture est deja emise.');
        }
      }
      if (!reservation && roomId) {
        selectedRoom = await tx.room.findUnique({ where: { id: roomId }, select: { id: true, number: true } });
        if (!selectedRoom) throw new AppError(404, 'La chambre choisie est introuvable. Actualisez la liste.');
      }
      const requestedMenuItemIds = items.flatMap((item) => 'menuItemId' in item ? [item.menuItemId] : []);
      const menuItems = await tx.restaurantMenuItem.findMany({ where: { id: { in: requestedMenuItemIds }, active: true } });
      if (menuItems.length !== requestedMenuItemIds.length) throw new AppError(409, 'Un produit de la carte est indisponible. Actualisez la carte.');
      const nights = reservation ? Math.max(1, Math.round((reservation.checkOutDate.getTime() - reservation.checkInDate.getTime()) / 86_400_000)) : 1;
      const lineData = items.map((requested) => {
        if (!('menuItemId' in requested)) {
          const quantity = requested.quantity;
          const unitPrice = new Prisma.Decimal(requested.unitPrice);
          return {
            menuItemId: null,
            name: requested.name,
            category: requested.category,
            billingUnit: 'ITEM' as const,
            quantity,
            unitPrice,
            lineTotal: unitPrice.mul(quantity),
          };
        }
        const menuItem = menuItems.find((item) => item.id === requested.menuItemId)!;
        const quantity = menuItem.billingUnit === 'ROOM_NIGHT' ? nights : requested.quantity;
        const unitPrice = new Prisma.Decimal(menuItem.price);
        const lineTotal = unitPrice.mul(quantity);
        return {
          menuItemId: menuItem.id,
          name: menuItem.name,
          category: menuItem.category,
          billingUnit: menuItem.billingUnit,
          quantity,
          unitPrice,
          lineTotal,
        };
      });
      const totalAmount = lineData.reduce((total, line) => total.add(line.lineTotal), new Prisma.Decimal(0));
      if (!totalAmount.gt(0)) throw new AppError(400, 'Le montant de la commande doit être supérieur à zéro.');
      const number = `R-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const created = await tx.restaurantOrder.create({
        data: {
          number,
          source,
          reservationId: reservation?.id ?? null,
          roomId: reservation?.room?.id ?? roomId ?? null,
          guestName: reservation?.client.name ?? `Client · chambre ${selectedRoom?.number ?? ''}`,
          notes: notes || null,
          totalAmount,
          createdBy: scope.userId,
          createdByName: scope.name,
          lines: { create: lineData },
        },
        include: restaurantOrderInclude,
      });
      const receptionists = await tx.user.findMany({
        where: { active: true, role: { code: 'RECEPTIONIST' } },
        select: { id: true },
      });
      if (receptionists.length) {
        const roomNumber = reservation?.room?.number ?? selectedRoom?.number ?? 'à rattacher';
        const message = `Nouvelle consommation ${created.number} — chambre ${roomNumber}, ${lineData.length} article(s), ${totalAmount.toFixed(0)} FCFA. À rattacher au séjour puis valider dans Commandes restaurant.`;
        await tx.notification.createMany({
          data: receptionists.map(({ id }) => ({ userId: id, message })),
        });
      }
      await tx.auditLog.create({
        data: { actorId: scope.userId, action: 'RESTAURANT_ORDER_CREATE', result: 'SUCCESS', targetId: created.id, details: { number: created.number, source, reservationId: reservation?.id ?? null, totalAmount: totalAmount.toFixed(2) } },
      });
      return created;
    });
    return NextResponse.json({ order: presentRestaurantOrder(order) }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

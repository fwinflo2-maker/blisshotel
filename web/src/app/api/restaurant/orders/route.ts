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
    category: z.enum(['FOOD', 'DRINK', 'BREAKFAST', 'SOFT_DRINK', 'JUICE', 'WATER', 'BEER', 'WINE', 'WHISKY', 'SPIRIT', 'COCKTAIL', 'STARTER', 'DESSERT', 'OTHER']),
    quantity: z.coerce.number().int().min(1).max(99),
    unitPrice: z.coerce.number().finite().min(50).max(100000000),
  }),
]);

const createOrderSchema = z.object({
  reservationId: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
  guestName: z.string().trim().min(2).max(160).optional(),
  paymentMethodId: z.string().min(1).optional(),
  settleImmediately: z.boolean().optional().default(false),
  receivedAmount: z.coerce.number().finite().min(0).optional(),
  source: z.enum(['ROOM_SERVICE', 'RESTAURANT']),
  items: z.array(requestedOrderItemSchema).min(1).max(30),
  notes: z.string().trim().max(500).optional().default(''),
}).superRefine((value, context) => {
  if (!value.reservationId && !value.guestName) context.addIssue({ code: 'custom', path: ['guestName'], message: 'Le nom du client est obligatoire pour une commande sans séjour.' });
  if (!value.reservationId && value.roomId) context.addIssue({ code: 'custom', path: ['reservationId'], message: 'Une chambre doit être associée à un séjour actif.' });
  if (!value.reservationId && !value.paymentMethodId) context.addIssue({ code: 'custom', path: ['paymentMethodId'], message: 'Un moyen de paiement est requis pour un client non logé.' });
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
    const search = new URL(request.url).searchParams;
    const pendingOnly = search.get('pending') === 'true';
    const mineOnly = search.get('mine') === 'true';
    const roomOrdersOnly = search.get('roomOrders') === 'true';
    const [orders, activeReservations, paymentMethods] = await Promise.all([
      db.restaurantOrder.findMany({
        where: {
          ...(pendingOnly ? { status: 'PENDING_RECEPTION' as const } : {}),
          ...(mineOnly ? { createdBy: scope.userId } : {}),
          ...(roomOrdersOnly ? { OR: [{ reservationId: { not: null } }, { roomId: { not: null } }] } : {}),
        },
        include: restaurantOrderInclude,
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
      }),
      db.reservation.findMany({
          where: { status: 'CHECKED_IN', roomId: { not: null }, stay: { is: { checkedOutAt: null } } },
          include: { room: { select: { id: true, number: true } }, client: { select: { name: true } }, stay: true, folio: { include: { invoice: true, payments: { select: { amount: true } } } } },
          orderBy: [{ checkOutDate: 'asc' }],
          take: 200,
        }),
      db.paymentMethod.findMany({ where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return NextResponse.json({
      orders: orders.map(presentRestaurantOrder),
      paymentMethods,
      activeStays: activeReservations
        .filter((reservation) => {
          if (!reservation.room || reservation.folio?.status !== 'OPEN') return false;
          if (!reservation.folio.invoice) return true;
          const paid = reservation.folio.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
          return Number(reservation.folio.invoice.totalAmount) > paid;
        })
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
    if (scope.roleCode !== 'BAR_SERVER') throw new AppError(403, 'La saisie des commandes est réservée aux serveuses.');
    const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Vérifiez le séjour, les produits et les quantités.' }, { status: 400 });
    const { reservationId, roomId, source, notes, items, paymentMethodId, receivedAmount, settleImmediately } = parsed.data;
    if (scope.roleCode === 'BAR_SERVER' && items.some((item) => !('menuItemId' in item))) {
      throw new AppError(403, 'Choisissez un produit et son prix configurés par la Responsable.');
    }
    // Une consommation de client non logé est toujours servie au bar-restaurant, jamais en chambre.
    const effectiveSource = reservationId ? source : 'RESTAURANT' as const;
    const order = await db.$transaction(async (tx) => {
      let reservation = null;
      if (reservationId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM Reservation WHERE id = ${reservationId} FOR UPDATE`;
        reservation = await tx.reservation.findUnique({
          where: { id: reservationId },
          include: { room: true, client: true, stay: true, folio: { include: { invoice: true, payments: { select: { amount: true } } } } },
        });
        if (!reservation || reservation.status !== 'CHECKED_IN' || !reservation.room || !reservation.stay || reservation.stay.checkedOutAt) {
          throw new AppError(409, "Le sejour choisi n'est plus en cours. Actualisez la liste.");
        }
        if (roomId && reservation.room.id !== roomId) throw new AppError(409, 'La chambre selectionnee ne correspond pas au sejour choisi.');
        if (!reservation.folio || reservation.folio.status !== 'OPEN') throw new AppError(409, 'Le folio du sejour choisi est ferme.');
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM Folio WHERE id = ${reservation.folio.id} FOR UPDATE`;
        const lockedFolio = await tx.folio.findUnique({ where: { id: reservation.folio.id }, include: { invoice: true, payments: { select: { amount: true } } } });
        if (!lockedFolio || lockedFolio.status !== 'OPEN') throw new AppError(409, 'Le folio du sejour choisi est ferme.');
        reservation.folio = lockedFolio;
        const paid = reservation.folio.payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
        const outstanding = reservation.folio.invoice ? reservation.folio.invoice.totalAmount.sub(paid) : new Prisma.Decimal(1);
        if (reservation.folio.invoice && !outstanding.gt(0)) throw new AppError(409, 'La facture de ce sejour est deja reglee.');
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
      const directPaymentMethod = (!reservation || settleImmediately) ? await tx.paymentMethod.findFirst({ where: { id: paymentMethodId, active: true }, select: { id: true, code: true, name: true } }) : null;
      if ((!reservation || settleImmediately) && !directPaymentMethod) throw new AppError(409, 'Choisissez un moyen de paiement actif.');
      if (directPaymentMethod?.code === 'CASH' && (receivedAmount === undefined || new Prisma.Decimal(receivedAmount).lt(totalAmount))) throw new AppError(400, 'Le montant reçu en espèces doit couvrir la commande.');
      const cashSession = directPaymentMethod ? await tx.cashSession.findFirst({ where: { userId: scope.userId, status: 'OPEN' }, select: { id: true } }) : null;
      if (directPaymentMethod && !cashSession) throw new AppError(409, 'Ouvrez votre caisse avant d’encaisser un client externe.');
      const number = `R-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
      let created = await tx.restaurantOrder.create({
        data: {
          number,
          source: effectiveSource,
          status: reservation ? (settleImmediately ? 'SERVED' : 'PENDING_RECEPTION') : 'SERVED',
          reservationId: reservation?.id ?? null,
          roomId: reservation?.room?.id ?? roomId ?? null,
          guestName: reservation?.client.name ?? parsed.data.guestName!,
          notes: notes || null,
          totalAmount,
          createdBy: scope.userId,
          createdByName: scope.name,
          lines: { create: lineData },
        },
        include: restaurantOrderInclude,
      });
      if (directPaymentMethod) {
        const confirmedAt = new Date();
        await tx.payment.create({ data: {
          restaurantOrderId: created.id,
          cashSessionId: cashSession!.id,
          paymentMethodId: directPaymentMethod.id,
          amount: totalAmount,
          idempotencyKey: `RESTAURANT-${created.id}`,
          receivedBy: scope.userId,
          reference: created.number,
          description: directPaymentMethod.code === 'CASH' ? `Commande ${created.number} · reçu ${new Prisma.Decimal(receivedAmount ?? totalAmount).toFixed(2)} · monnaie ${(new Prisma.Decimal(receivedAmount ?? totalAmount).sub(totalAmount)).toFixed(2)}` : `Commande restaurant ${created.number}`,
        } });
        created = await tx.restaurantOrder.update({
          where: { id: created.id },
          data: { paidAt: confirmedAt, paidBy: scope.userId, paidByName: scope.name, paymentMethodId: directPaymentMethod.id },
          include: restaurantOrderInclude,
        });
      }
      const receptionists = reservation ? await tx.user.findMany({
        where: { active: true, role: { code: 'RECEPTIONIST' } },
        select: { id: true },
      }) : [];
      if (receptionists.length && reservation && !directPaymentMethod) {
        const roomNumber = reservation?.room?.number ?? 'client non logé';
        const message = `Commande ${created.number} enregistree pour le client de la chambre ${roomNumber} ; ${totalAmount.toFixed(0)} FCFA a valider en reception avant ajout au folio.`;
        await tx.notification.createMany({
          data: receptionists.map(({ id }) => ({ userId: id, message })),
        });
      }
      await tx.auditLog.create({
        data: { actorId: scope.userId, action: 'RESTAURANT_ORDER_CREATE', result: 'SUCCESS', targetId: created.id, details: { number: created.number, source: effectiveSource, reservationId: reservation?.id ?? null, roomId: reservation?.roomId ?? null, totalAmount: totalAmount.toFixed(2), ...(directPaymentMethod ? { paid: true, paymentMethod: directPaymentMethod.code, receivedAmount: receivedAmount ?? totalAmount.toNumber(), change: Math.max(0, (receivedAmount ?? totalAmount.toNumber()) - totalAmount.toNumber()) } : {}) } },
      });
      return created;
    });
    return NextResponse.json({ order: presentRestaurantOrder(order) }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

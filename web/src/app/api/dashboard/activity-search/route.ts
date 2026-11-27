import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { scopeFor } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { parseDateOnly, parseHotelDateTime } from '@/server/reception';

export const instant = false;

export async function GET(request: Request) {
  try {
    const scope = await scopeFor();
    if (!scope.permissions.includes('dashboard.view')) throw new AppError(403, 'Accès au tableau de bord refusé.');
    const canSeeOrders = ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT', 'RECEPTIONIST', 'RESTAURANT_MANAGER', 'BAR_SERVER', 'HOTEL_ADMIN', 'SUPER_ADMIN'].includes(scope.roleCode ?? '');
    if (!canSeeOrders) throw new AppError(403, 'Recherche non disponible pour ce profil.');

    const params = new URL(request.url).searchParams;
    const fromText = params.get('from') ?? '';
    const toText = params.get('to') ?? '';
    const query = (params.get('q') ?? '').trim().slice(0, 120);
    if (!fromText || !toText) return NextResponse.json({ error: 'Sélectionnez les dates de début et de fin.' }, { status: 400 });
    const fromDate = parseDateOnly(fromText);
    const toDate = parseDateOnly(toText);
    const oldestAllowed = new Date(toDate);
    oldestAllowed.setUTCFullYear(oldestAllowed.getUTCFullYear() - 99);
    if (fromDate > toDate || fromDate < oldestAllowed) {
      return NextResponse.json({ error: 'La période doit être valide et ne pas dépasser 99 ans.' }, { status: 400 });
    }
    const configuration = await hotelConfiguration();
    const untilDate = new Date(toDate);
    untilDate.setUTCDate(untilDate.getUTCDate() + 1);
    const from = parseHotelDateTime(`${fromText}T00:00`, configuration.timezone);
    const until = parseHotelDateTime(`${untilDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);

    const orderScope: Prisma.RestaurantOrderWhereInput = {};
    if (scope.roleCode === 'BAR_SERVER') orderScope.createdBy = scope.userId;
    if (scope.roleCode === 'HOTEL_ADMIN') orderScope.OR = [
      { room: { is: { assignedHotelAdminId: scope.userId, active: true } } },
      { reservation: { is: { room: { is: { assignedHotelAdminId: scope.userId, active: true } } } } },
    ];
    const periodOrderWhere: Prisma.RestaurantOrderWhereInput = { AND: [orderScope, { createdAt: { gte: from, lt: until } }] };
    const matchingOrderWhere: Prisma.RestaurantOrderWhereInput = query
      ? { AND: [periodOrderWhere, { OR: [
        { number: { contains: query } },
        { guestName: { contains: query } },
        { createdByName: { contains: query } },
        { reservation: { is: { reference: { contains: query } } } },
      ] }] }
      : periodOrderWhere;

    const clientScope: Prisma.ClientWhereInput = scope.roleCode === 'HOTEL_ADMIN'
      ? { reservations: { some: { room: { is: { assignedHotelAdminId: scope.userId, active: true } } } } }
      : scope.roleCode === 'RECEPTIONIST' ? { createdBy: scope.userId } : {};
    const clientWhere: Prisma.ClientWhereInput = { ...clientScope, createdAt: { gte: from, lt: until } };
    const canSeeClients = scope.permissions.includes('clients.view');
    const clientSearchWhere: Prisma.ClientWhereInput = query && canSeeClients
      ? { ...clientWhere, OR: [{ name: { contains: query } }, { phone: { contains: query } }, { email: { contains: query } }] }
      : clientWhere;

    const [ordersCount, sales, clientsCount, orders, clients] = await Promise.all([
      db.restaurantOrder.count({ where: periodOrderWhere }),
      db.restaurantOrder.aggregate({ where: { ...periodOrderWhere, status: 'SERVED' }, _sum: { totalAmount: true }, _count: { id: true } }),
      canSeeClients ? db.client.count({ where: clientWhere }) : Promise.resolve(0),
      db.restaurantOrder.findMany({
        where: matchingOrderWhere,
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, number: true, guestName: true, status: true, totalAmount: true, createdAt: true, paidAt: true, createdByName: true, room: { select: { number: true } }, reservation: { select: { reference: true } } },
      }),
      canSeeClients && query ? db.client.findMany({ where: clientSearchWhere, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, name: true, phone: true, createdAt: true } }) : Promise.resolve([]),
    ]);
    return NextResponse.json({
      from: fromText,
      to: toText,
      query,
      summary: { orders: ordersCount, salesCount: sales._count.id, salesAmount: sales._sum.totalAmount?.toFixed(2) ?? '0.00', clients: clientsCount },
      orders: orders.map((order) => ({ ...order, totalAmount: order.totalAmount.toFixed(2) })),
      clients,
      canSeeClients,
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

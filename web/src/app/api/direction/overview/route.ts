import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizedScope, requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { folioTotals, hotelDateKey, parseDateOnly, parseHotelDateTime } from '@/server/reception';
import { getReceptionistPerformance } from '@/server/reception-performance';
import { isPerformanceGranularity } from '@/features/reception-performance/domain';

export const instant = false;

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (session.user.platformAdmin || session.user.role?.code !== 'GENERAL_MANAGER') {
      return NextResponse.json({ error: 'Accès réservé au Directeur Général.' }, { status: 403 });
    }
    await authorizedScope('reports.financial.view');

    const configuration = await hotelConfiguration();
    const params = new URL(request.url).searchParams;
    const today = hotelDateKey(new Date(), configuration.timezone);
    const fromText = params.get('from') ?? today;
    const toText = params.get('to') ?? today;
    let fromDate: Date;
    let endDate: Date;
    try {
      fromDate = parseDateOnly(fromText);
      endDate = parseDateOnly(toText);
    } catch (error) {
      if (error instanceof AppError) return NextResponse.json({ error: 'Période invalide.' }, { status: 400 });
      throw error;
    }
    const oldestAllowed = new Date(endDate);
    oldestAllowed.setUTCFullYear(oldestAllowed.getUTCFullYear() - 99);
    if (fromDate > endDate || fromDate < oldestAllowed) return NextResponse.json({ error: 'La période doit être valide et ne pas dépasser 99 ans.' }, { status: 400 });
    const from = parseHotelDateTime(`${fromText}T00:00`, configuration.timezone);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const until = parseHotelDateTime(`${endDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    const spanDays = Math.ceil((until.getTime() - from.getTime()) / 86_400_000);
    const requestedGranularity = params.get('groupBy');
    if (requestedGranularity !== null && !isPerformanceGranularity(requestedGranularity)) {
      return NextResponse.json({ error: 'Regroupement de période invalide.' }, { status: 400 });
    }
    const performanceGranularity = isPerformanceGranularity(requestedGranularity)
      ? requestedGranularity
      : spanDays <= 31 ? 'day' : spanDays <= 183 ? 'week' : spanDays <= 3660 ? 'month' : 'year';

    const [roomRows, arrivals, departures, activeStayRows, pendingReservations, confirmedReservations, invoices, payments, openFolios, closedCashSessions, openCashSessions, openTasks, shiftReports, restaurantSalesByGuestType, restaurantPaidByGuestType, restaurantActivity, restaurantStock, trendInvoices, trendRestaurant, trendLodging, trendReservations, receptionistPerformance] = await Promise.all([
      db.room.findMany({ select: { id: true, status: true, housekeepingStatus: true, technicalStatus: true } }),
      db.reservation.count({ where: { checkInDate: { gte: fromDate, lt: endDate }, status: { in: ['PENDING', 'CONFIRMED'] } } }),
      db.reservation.count({ where: { checkOutDate: { gte: fromDate, lt: endDate }, status: 'CHECKED_IN' } }),
      db.stay.findMany({ where: { checkedOutAt: null }, select: { roomId: true } }),
      db.reservation.count({ where: { status: 'PENDING' } }),
      db.reservation.count({ where: { status: 'CONFIRMED' } }),
      db.invoice.aggregate({ where: { issuedAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { totalAmount: true } }),
      db.payment.aggregate({ where: { createdAt: { gte: from, lt: until }, restaurantOrderId: null, amount: { gt: 0 } }, _count: { id: true }, _sum: { amount: true } }),
      db.folio.findMany({ where: { status: 'OPEN' }, include: { lines: { select: { amount: true } }, payments: { select: { amount: true } } } }),
      db.cashSession.findMany({ where: { status: 'CLOSED', closedAt: { gte: from, lt: until } }, select: { variance: true } }),
      db.cashSession.count({ where: { status: 'OPEN' } }),
      db.housekeepingTask.count({ where: { status: { not: 'COMPLETED' } } }),
      db.receptionShiftReport.count({ where: { startedAt: { gte: from, lt: until } } }),
      db.restaurantOrder.groupBy({ by: ['reservationId'], where: { createdAt: { gte: from, lt: until }, status: { not: 'REJECTED' } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.groupBy({ by: ['reservationId'], where: { createdAt: { gte: from, lt: until }, paidAt: { not: null } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.findMany({ where: { createdAt: { gte: from, lt: until } }, orderBy: { createdAt: 'desc' }, take: 300, select: { id: true, number: true, guestName: true, reservationId: true, status: true, totalAmount: true, createdAt: true, createdByName: true, paidAt: true, paymentMethod: { select: { name: true } }, room: { select: { number: true } }, lines: { select: { name: true, quantity: true } } } }),
      db.restaurantMenuItem.findMany({ where: { deletedAt: null }, orderBy: [{ category: 'asc' }, { name: 'asc' }], select: { id: true, name: true, category: true, stockQuantity: true, stockUnit: true, stockAlertAt: true, stockCounts: { orderBy: { createdAt: 'desc' }, take: 1, select: { countedByName: true, createdAt: true } } } }),
      db.invoice.findMany({ where: { issuedAt: { gte: from, lt: until } }, select: { issuedAt: true, totalAmount: true } }),
      db.restaurantOrder.findMany({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED' }, select: { createdAt: true, totalAmount: true } }),
      db.folioLine.findMany({ where: { type: 'ACCOMMODATION', createdAt: { gte: from, lt: until } }, select: { createdAt: true, amount: true } }),
      db.reservation.findMany({ where: { createdAt: { gte: from, lt: until } }, select: { createdAt: true } }),
      getReceptionistPerformance(from, until, performanceGranularity, configuration.timezone),
    ]);
    const [commissionPayments, stayEvents] = await Promise.all([
      db.payment.findMany({ where: { createdAt: { gte: from, lt: until }, description: { startsWith: 'Commission réservation' }, amount: { lt: 0 } }, select: { amount: true, receivedBy: true } }),
      db.auditLog.findMany({ where: { action: { in: ['RECEPTION_STAY_CHECK_IN', 'RECEPTION_STAY_CHECK_OUT'] }, result: 'SUCCESS', createdAt: { gte: from, lt: until } }, orderBy: { createdAt: 'desc' }, take: 50, select: { action: true, actorId: true, createdAt: true, targetId: true } }),
    ]);
    const receptionUserIds = [...new Set([...commissionPayments.map((payment) => payment.receivedBy), ...stayEvents.flatMap((event) => event.actorId ? [event.actorId] : [])])];
    const receptionUsers = await db.user.findMany({ where: { id: { in: receptionUserIds } }, select: { id: true, name: true } });
    const receptionNames = new Map(receptionUsers.map((user) => [user.id, user.name]));
    const commissionByReceptionist = new Map<string, Prisma.Decimal>();
    for (const payment of commissionPayments) {
      const operator = receptionNames.get(payment.receivedBy) ?? 'Inconnu';
      commissionByReceptionist.set(operator, (commissionByReceptionist.get(operator) ?? new Prisma.Decimal(0)).add(payment.amount.abs()));
    }
    const breakfastAssociations = await db.folioLine.aggregate({ where: { type: 'SERVICE', description: 'Petit-déjeuner', createdAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { amount: true } });
    const trendMode = spanDays <= 31 ? 'day' : spanDays <= 183 ? 'week' : spanDays <= 3660 ? 'month' : 'year';
    const trendBucket = (date: Date) => {
      if (trendMode === 'day') return date.toISOString().slice(0, 10);
      if (trendMode === 'week') { const monday = new Date(date); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); return monday.toISOString().slice(0, 10); }
      return trendMode === 'month' ? date.toISOString().slice(0, 7) : date.toISOString().slice(0, 4);
    };
    const trendMap = new Map<string, { period: string; lodging: number; invoiced: number; restaurant: number; reservations: number }>();
    const trendPoint = (date: Date) => { const period = trendBucket(date); const point = trendMap.get(period) ?? { period, lodging: 0, invoiced: 0, restaurant: 0, reservations: 0 }; trendMap.set(period, point); return point; };
    for (const row of trendInvoices) trendPoint(row.issuedAt).invoiced += Number(row.totalAmount);
    for (const row of trendRestaurant) trendPoint(row.createdAt).restaurant += Number(row.totalAmount);
    for (const row of trendLodging) trendPoint(row.createdAt).lodging += Number(row.amount);
    for (const row of trendReservations) trendPoint(row.createdAt).reservations++;
    const trends = [...trendMap.values()].sort((a, b) => a.period.localeCompare(b.period));
    const rooms = { total: 0, available: 0, occupied: 0, dirty: 0, outOfService: 0 };
    const occupiedRoomIds = new Set(activeStayRows.map((stay) => stay.roomId));
    for (const room of roomRows) {
      rooms.total += 1;
      if (occupiedRoomIds.has(room.id)) {
        rooms.occupied += 1;
        continue;
      }
      const status = room.status === 'OCCUPIED'
        ? (room.housekeepingStatus === 'CLEAN' && room.technicalStatus === 'OPERATIONAL' ? 'AVAILABLE' : 'DIRTY')
        : room.status;
      if (status === 'AVAILABLE') rooms.available += 1;
      if (status === 'DIRTY') rooms.dirty += 1;
      if (status === 'OUT_OF_SERVICE') rooms.outOfService += 1;
    }
    const activeStays = activeStayRows.length;
    const openBalance = openFolios.map(folioTotals).reduce((sum, folio) => sum.add(folio.balance), new Prisma.Decimal(0));
    const cashVariance = closedCashSessions.reduce((sum, session) => sum.add(session.variance ?? 0), new Prisma.Decimal(0));
    const restaurantStats = (isLodged: boolean) => {
      const sales = restaurantSalesByGuestType.filter((item) => (item.reservationId !== null) === isLodged).reduce((total, item) => ({ orders: total.orders + item._count.id, amount: total.amount.add(item._sum.totalAmount ?? 0) }), { orders: 0, amount: new Prisma.Decimal(0) });
      const paid = restaurantPaidByGuestType.filter((item) => (item.reservationId !== null) === isLodged).reduce((total, item) => total.add(item._sum.totalAmount ?? 0), new Prisma.Decimal(0));
      return { orders: sales.orders, amount: sales.amount.toFixed(2), paidAmount: paid.toFixed(2) };
    };
    const restaurant = { lodged: restaurantStats(true), nonLodged: restaurantStats(false) };
    const restaurantTotalAmount = new Prisma.Decimal(restaurant.lodged.amount).add(restaurant.nonLodged.amount).toFixed(2);
    const paidRestaurantAmount = restaurantActivity.filter((order) => order.paidAt).reduce((sum, order) => sum.add(order.totalAmount), new Prisma.Decimal(0));
    const salesByServer = new Map<string, { orders: number; served: number; sales: Prisma.Decimal; collected: Prisma.Decimal }>();
    for (const order of restaurantActivity) {
      const row = salesByServer.get(order.createdByName) ?? { orders: 0, served: 0, sales: new Prisma.Decimal(0), collected: new Prisma.Decimal(0) };
      row.orders++;
      if (order.status === 'SERVED') { row.served++; row.sales = row.sales.add(order.totalAmount); }
      if (order.paidAt) row.collected = row.collected.add(order.totalAmount);
      salesByServer.set(order.createdByName, row);
    }
    return NextResponse.json({
      period: { from: fromText, to: toText },
      timezone: configuration.timezone,
      receptionistPerformance,
      trends,
      rooms,
      operations: { arrivals, departures, activeStays, pendingReservations, confirmedReservations, openCashSessions, openHousekeepingTasks: openTasks, receptionShiftReports: shiftReports },
      commissions: { total: commissionPayments.reduce((sum, payment) => sum.add(payment.amount.abs()), new Prisma.Decimal(0)).toFixed(2), count: commissionPayments.length, byReceptionist: [...commissionByReceptionist].map(([name, amount]) => ({ name, amount: amount.toFixed(2) })) },
      frontDeskActivity: stayEvents.map((event) => ({ action: event.action, at: event.createdAt.toISOString(), receptionist: receptionNames.get(event.actorId ?? '') ?? 'Inconnu', reservationId: event.targetId })),
      restaurant: {
        ...restaurant,
        totalAmount: restaurantTotalAmount,
        paidAmount: paidRestaurantAmount.toFixed(2),
        breakfastAssociations: { count: breakfastAssociations._count.id, amount: breakfastAssociations._sum.amount?.toFixed(2) ?? '0.00' },
        salesByServer: [...salesByServer.entries()].map(([name, row]) => ({ name, orders: row.orders, served: row.served, sales: row.sales.toFixed(2), collected: row.collected.toFixed(2) })),
        recentOrders: restaurantActivity.slice(0, 25).map((order) => ({ ...order, totalAmount: order.totalAmount.toFixed(2), createdAt: order.createdAt.toISOString(), paidAt: order.paidAt?.toISOString() ?? null, room: order.room?.number ?? null, lines: order.lines.map((line) => ({ ...line })) })),
        stock: restaurantStock.map((item) => ({ id: item.id, name: item.name, category: item.category, quantity: item.stockQuantity?.toFixed(2) ?? null, unit: item.stockUnit, alertAt: item.stockAlertAt?.toFixed(2) ?? null, lastCount: item.stockCounts[0] ? { by: item.stockCounts[0].countedByName, at: item.stockCounts[0].createdAt.toISOString() } : null })),
      },
      finance: {
        invoicesCount: invoices._count.id,
        invoicedAmount: invoices._sum.totalAmount?.toFixed(2) ?? '0.00',
        paymentsCount: payments._count.id + restaurantActivity.filter((order) => order.paidAt).length,
        collectedAmount: (payments._sum.amount ?? new Prisma.Decimal(0)).add(paidRestaurantAmount).toFixed(2),
        openFolios: openFolios.length,
        outstandingBalance: openBalance.toFixed(2),
        cashVariance: cashVariance.toFixed(2),
        closedCashSessions: closedCashSessions.length,
      },
      alerts: [
        ...(rooms.outOfService ? [`${rooms.outOfService} chambre(s) hors service`] : []),
        ...(rooms.dirty ? [`${rooms.dirty} chambre(s) à remettre en état`] : []),
        ...(openTasks ? [`${openTasks} tâche(s) d’entretien en cours`] : []),
        ...(openBalance.gt(0) ? [`Solde client ouvert : ${openBalance.toFixed(2)} ${configuration.currency}`] : []),
      ],
      currency: configuration.currency,
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

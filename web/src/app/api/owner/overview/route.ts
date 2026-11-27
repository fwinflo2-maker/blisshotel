import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { folioTotals, hotelDateKey, parseDateOnly, parseHotelDateTime } from '@/server/reception';
import { getReceptionistPerformance } from '@/server/reception-performance';
import { isPerformanceGranularity } from '@/features/reception-performance/domain';
import { serializeShiftReport, shiftReportInclude } from '@/server/shift-reports';

export const instant = false;

const shiftDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (!session.user.platformAdmin && session.user.role?.code !== 'OWNER') throw new AppError(403, 'Accès réservé au Propriétaire ou au Super Administrateur.');
    const configuration = await hotelConfiguration();
    const params = new URL(request.url).searchParams;
    const today = hotelDateKey(new Date(), configuration.timezone);
    const fromText = params.get('from') ?? today;
    const toText = params.get('to') ?? today;
    let fromDate: Date;
    let toDate: Date;
    try {
      fromDate = parseDateOnly(fromText);
      toDate = parseDateOnly(toText);
    } catch (error) {
      if (error instanceof AppError) return NextResponse.json({ error: 'Période invalide.' }, { status: 400 });
      throw error;
    }
    const oldestAllowed = new Date(toDate);
    oldestAllowed.setUTCFullYear(oldestAllowed.getUTCFullYear() - 99);
    if (fromDate > toDate || fromDate < oldestAllowed) {
      return NextResponse.json({ error: 'Choisissez une période valide, limitée à 99 ans.' }, { status: 400 });
    }
    const endDate = shiftDays(toDate, 1);
    const periodDays = Math.round((endDate.getTime() - fromDate.getTime()) / 86_400_000);
    const previousFromDate = shiftDays(fromDate, -periodDays);
    const from = parseHotelDateTime(`${fromText}T00:00`, configuration.timezone);
    const until = parseHotelDateTime(`${endDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    const previousFrom = parseHotelDateTime(`${previousFromDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    const performanceSpanDays = Math.ceil((until.getTime() - from.getTime()) / 86_400_000);
    const requestedGranularity = params.get('groupBy');
    if (requestedGranularity !== null && !isPerformanceGranularity(requestedGranularity)) {
      return NextResponse.json({ error: 'Regroupement de période invalide.' }, { status: 400 });
    }
    const performanceGranularity = isPerformanceGranularity(requestedGranularity)
      ? requestedGranularity
      : performanceSpanDays <= 31 ? 'day' : performanceSpanDays <= 183 ? 'week' : performanceSpanDays <= 3660 ? 'month' : 'year';

    const rooms = await db.room.findMany({ where: { active: true }, select: { id: true, status: true, housekeepingStatus: true, technicalStatus: true } });
    const activeStays = await db.stay.findMany({ where: { checkedOutAt: null }, select: { roomId: true } });
    const reservedRooms = await db.reservation.findMany({ where: { roomId: { not: null }, status: { in: ['PENDING', 'CONFIRMED'] }, checkInDate: { lte: toDate }, checkOutDate: { gt: fromDate } }, distinct: ['roomId'], select: { roomId: true } });
    const arrivals = await db.reservation.count({ where: { checkInDate: { gte: fromDate, lt: endDate }, status: { in: ['PENDING', 'CONFIRMED'] } } });
    const departures = await db.reservation.count({ where: { checkOutDate: { gte: fromDate, lt: endDate }, status: 'CHECKED_IN' } });
    const reservationStatuses = await db.reservation.groupBy({ by: ['status'], where: { createdAt: { gte: from, lt: until } }, _count: { _all: true } });
    const invoices = await db.invoice.aggregate({ where: { issuedAt: { gte: from, lt: until } }, _sum: { totalAmount: true }, _count: { id: true } });
    const payments = await db.payment.aggregate({ where: { createdAt: { gte: from, lt: until }, restaurantOrderId: null, amount: { gt: 0 } }, _sum: { amount: true }, _count: { id: true } });
    const previousInvoices = await db.invoice.aggregate({ where: { issuedAt: { gte: previousFrom, lt: from } }, _sum: { totalAmount: true } });
    const previousPayments = await db.payment.aggregate({ where: { createdAt: { gte: previousFrom, lt: from }, restaurantOrderId: null, amount: { gt: 0 } }, _sum: { amount: true } });
    const commissionPayments = await db.payment.findMany({ where: { createdAt: { gte: from, lt: until }, description: { startsWith: 'Commission réservation' }, amount: { lt: 0 } }, select: { amount: true, receivedBy: true } });
    const commissionUsers = await db.user.findMany({ where: { id: { in: [...new Set(commissionPayments.map((payment) => payment.receivedBy))] } }, select: { id: true, name: true } });
    const commissionNames = new Map(commissionUsers.map((user) => [user.id, user.name]));
    const commissionTotals = new Map<string, Prisma.Decimal>();
    for (const payment of commissionPayments) { const name = commissionNames.get(payment.receivedBy) ?? 'Inconnu'; commissionTotals.set(name, (commissionTotals.get(name) ?? new Prisma.Decimal(0)).add(payment.amount.abs())); }
    const commissionTotal = commissionPayments.reduce((sum, payment) => sum.add(payment.amount.abs()), new Prisma.Decimal(0));
    const [trendInvoices, trendReservations, lodgingLines, restaurantStock, trendRestaurant] = await Promise.all([
      db.invoice.findMany({ where: { issuedAt: { gte: from, lt: until } }, select: { issuedAt: true, totalAmount: true } }),
      db.reservation.findMany({ where: { createdAt: { gte: from, lt: until } }, select: { createdAt: true } }),
      db.folioLine.findMany({ where: { type: 'ACCOMMODATION', createdAt: { gte: from, lt: until } }, select: { createdAt: true, amount: true } }),
      db.restaurantMenuItem.findMany({ where: { deletedAt: null }, orderBy: [{ category: 'asc' }, { name: 'asc' }], select: { id: true, name: true, category: true, active: true, stockQuantity: true, stockUnit: true, stockAlertAt: true, stockCounts: { orderBy: { createdAt: 'desc' }, take: 1, select: { countedByName: true, createdAt: true } } } }),
      db.restaurantOrder.findMany({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED' }, select: { createdAt: true, totalAmount: true } }),
    ]);
    const spanDays = toDate.getTime() - fromDate.getTime() + 86_400_000;
    const trendMode = spanDays <= 31 ? 'day' : spanDays <= 183 ? 'week' : spanDays <= 3660 ? 'month' : 'year';
    const trendMap = new Map<string, { invoiced: number; reservations: number; lodging: number; restaurant: number }>();
    const trendKey = (date: Date) => {
      if (trendMode === 'year') return date.toISOString().slice(0, 4);
      if (trendMode === 'month') return date.toISOString().slice(0, 7);
      if (trendMode === 'day') return date.toISOString().slice(0, 10);
      const weekStart = new Date(date);
      weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
      return weekStart.toISOString().slice(0, 10);
    };
    for (const invoice of trendInvoices) {
      const key = trendKey(invoice.issuedAt);
      const current = trendMap.get(key) ?? { invoiced: 0, reservations: 0, lodging: 0, restaurant: 0 };
      current.invoiced += Number(invoice.totalAmount);
      trendMap.set(key, current);
    }
    for (const reservation of trendReservations) {
      const key = trendKey(reservation.createdAt);
      const current = trendMap.get(key) ?? { invoiced: 0, reservations: 0, lodging: 0, restaurant: 0 };
      current.reservations += 1;
      trendMap.set(key, current);
    }
    for (const line of lodgingLines) {
      const key = trendKey(line.createdAt);
      const current = trendMap.get(key) ?? { invoiced: 0, reservations: 0, lodging: 0, restaurant: 0 };
      current.lodging += Number(line.amount);
      trendMap.set(key, current);
    }
    for (const order of trendRestaurant) {
      const key = trendKey(order.createdAt);
      const current = trendMap.get(key) ?? { invoiced: 0, reservations: 0, lodging: 0, restaurant: 0 };
      current.restaurant += Number(order.totalAmount);
      trendMap.set(key, current);
    }
    const trends = [...trendMap].sort(([a], [b]) => a.localeCompare(b)).map(([period, values]) => ({ period, ...values }));
    const openFolios = await db.folio.findMany({ include: { lines: { select: { amount: true } }, payments: { select: { amount: true } }, reservation: { select: { reference: true, client: { select: { name: true } }, room: { select: { number: true } } } } } });
    const expenses = await db.receptionShiftExpense.aggregate({ where: { report: { is: { shiftDate: { gte: fromDate, lt: endDate } } } }, _sum: { amount: true }, _count: { id: true } });
    const [cashAggregate, cashDiscrepancies, receptionistPerformance] = await Promise.all([
      db.cashSession.aggregate({ where: { status: 'CLOSED', closedAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { variance: true } }),
      db.cashSession.findMany({ where: { status: 'CLOSED', closedAt: { gte: from, lt: until }, variance: { not: 0 } }, orderBy: { closedAt: 'desc' }, take: 20, select: { id: true, variance: true, closedAt: true, user: { select: { name: true } } } }),
      getReceptionistPerformance(from, until, performanceGranularity, configuration.timezone),
    ]);
    const [restaurantStatuses, breakfastAssociations] = await Promise.all([
      db.restaurantOrder.groupBy({ by: ['status'], where: { createdAt: { gte: from, lt: until } }, _count: { _all: true }, _sum: { totalAmount: true } }),
      db.folioLine.aggregate({ where: { type: 'SERVICE', description: 'Petit-déjeuner', createdAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { amount: true } }),
    ]);
    const recentEvents = await db.auditLog.findMany({ where: { createdAt: { gte: from, lt: until } }, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, actorId: true, action: true, result: true, targetId: true, createdAt: true } });
    const shiftReports = await db.receptionShiftReport.findMany({ where: { shiftDate: { gte: fromDate, lt: endDate } }, include: shiftReportInclude, orderBy: { endedAt: 'desc' }, take: 8 });
    const activeUsers = await db.user.count({ where: { active: true, platformAdmin: false } });
    const recentUsers = await db.user.findMany({ where: { platformAdmin: false }, orderBy: [{ lastLoginAt: 'desc' }, { createdAt: 'desc' }], take: 8, select: { id: true, name: true, active: true, lastLoginAt: true, role: { select: { name: true } } } });
    const restaurantActivity = await db.restaurantOrder.findMany({ where: { createdAt: { gte: from, lt: until } }, orderBy: { createdAt: 'desc' }, take: 1000, select: { id: true, number: true, status: true, totalAmount: true, createdAt: true, createdByName: true, guestName: true, reservationId: true, paidAt: true, paidByName: true, paymentMethod: { select: { name: true } }, room: { select: { number: true } } } });
    const previousRestaurantPayments = await db.restaurantOrder.aggregate({ where: { paidAt: { gte: previousFrom, lt: from } }, _sum: { totalAmount: true }, _count: { id: true } });
    const lodgedSales = await db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED', reservationId: { not: null } }, _sum: { totalAmount: true }, _count: { id: true } });
    const nonLodgedSales = await db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED', reservationId: null }, _sum: { totalAmount: true }, _count: { id: true } });
    const lodgedPaid = await db.restaurantOrder.aggregate({ where: { paidAt: { gte: from, lt: until }, reservationId: { not: null } }, _sum: { totalAmount: true }, _count: { id: true } });
    const nonLodgedPaid = await db.restaurantOrder.aggregate({ where: { paidAt: { gte: from, lt: until }, reservationId: null }, _sum: { totalAmount: true }, _count: { id: true } });
    const [servedByServer, paidByServer] = await Promise.all([
      db.restaurantOrder.groupBy({ by: ['createdByName'], where: { createdAt: { gte: from, lt: until }, status: 'SERVED' }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.groupBy({ by: ['createdByName'], where: { createdAt: { gte: from, lt: until }, paidAt: { not: null } }, _sum: { totalAmount: true } }),
    ]);

    const occupiedIds = new Set(activeStays.map((stay) => stay.roomId));
    const roomCounts = { total: rooms.length, occupied: 0, available: 0, reserved: 0, dirty: 0, outOfService: 0, maintenance: 0 };
    const reservedIds = new Set(reservedRooms.flatMap((room) => room.roomId ? [room.roomId] : []));
    for (const room of rooms) {
      if (occupiedIds.has(room.id)) roomCounts.occupied++;
      else if (room.technicalStatus !== 'OPERATIONAL' || room.status === 'OUT_OF_SERVICE') roomCounts.outOfService++;
      else if (room.status === 'DIRTY' || room.housekeepingStatus !== 'CLEAN') roomCounts.dirty++;
      else if (reservedIds.has(room.id)) roomCounts.reserved++;
      else roomCounts.available++;
      if (room.technicalStatus !== 'OPERATIONAL') roomCounts.maintenance++;
    }

    const balances = openFolios.map((folio) => ({ folio, ...folioTotals(folio) })).filter(({ balance }) => balance.gt(0));
    const outstanding = balances.reduce((sum, item) => sum.add(item.balance), new Prisma.Decimal(0));
    const statusCount = (status: string) => reservationStatuses.find((item) => item.status === status)?._count._all ?? 0;
    const restaurantCount = (status: string) => restaurantStatuses.find((item) => item.status === status)?._count._all ?? 0;
    const restaurantSales = restaurantStatuses.reduce((sum, item) => item.status === 'SERVED' ? sum.add(item._sum.totalAmount ?? 0) : sum, new Prisma.Decimal(0));
    const restaurantPaid = (lodgedPaid._sum.totalAmount ?? new Prisma.Decimal(0)).add(nonLodgedPaid._sum.totalAmount ?? 0);
    const salesByServerMap = new Map<string, { orders: number; served: number; amount: Prisma.Decimal; collected: Prisma.Decimal }>();
    for (const row of servedByServer) {
      salesByServerMap.set(row.createdByName, { orders: row._count.id, served: row._count.id, amount: row._sum.totalAmount ?? new Prisma.Decimal(0), collected: new Prisma.Decimal(0) });
    }
    for (const row of paidByServer) {
      const current = salesByServerMap.get(row.createdByName) ?? { orders: 0, served: 0, amount: new Prisma.Decimal(0), collected: new Prisma.Decimal(0) };
      current.collected = current.collected.add(row._sum.totalAmount ?? 0);
      salesByServerMap.set(row.createdByName, current);
    }
    const salesByServer = [...salesByServerMap.entries()].map(([name, row]) => ({ name, orders: row.orders, served: row.served, sales: row.amount.toFixed(2), collected: row.collected.toFixed(2) }));
    const guestTypeStats = (sales: typeof lodgedSales, paid: typeof lodgedPaid) => ({
      orders: sales._count.id,
      amount: sales._sum.totalAmount?.toFixed(2) ?? '0.00',
      paidAmount: paid._sum.totalAmount?.toFixed(2) ?? '0.00',
    });
    const variance = cashAggregate._sum.variance ?? new Prisma.Decimal(0);
    const actorIds = [...new Set(recentEvents.flatMap((event) => event.actorId ? [event.actorId] : []))];
    const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
    const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));

    return NextResponse.json({
      hotel: { name: configuration.name, currency: configuration.currency, timezone: configuration.timezone },
      period: { from: fromText, to: toText, previousFrom: previousFromDate.toISOString().slice(0, 10), previousTo: shiftDays(fromDate, -1).toISOString().slice(0, 10) },
      receptionistPerformance,
      shiftReports: shiftReports.map(serializeShiftReport),
      finance: {
        invoiced: invoices._sum.totalAmount?.toFixed(2) ?? '0.00', invoiceCount: invoices._count.id,
        collected: (payments._sum.amount ?? new Prisma.Decimal(0)).add(restaurantPaid).toFixed(2), paymentCount: payments._count.id + lodgedPaid._count.id + nonLodgedPaid._count.id,
        outstanding: outstanding.toFixed(2), debtors: balances.length,
        expenses: (expenses._sum.amount ?? new Prisma.Decimal(0)).add(commissionTotal).toFixed(2), expenseCount: expenses._count.id + commissionPayments.length,
        previousInvoiced: previousInvoices._sum.totalAmount?.toFixed(2) ?? '0.00',
        previousCollected: (previousPayments._sum.amount ?? new Prisma.Decimal(0)).add(previousRestaurantPayments._sum.totalAmount ?? 0).toFixed(2),
        estimatedOperatingResult: invoices._count.id > 0 || expenses._count.id > 0
          ? (invoices._sum.totalAmount ?? new Prisma.Decimal(0)).sub(expenses._sum.amount ?? 0).toFixed(2)
          : null,
      },
      commissions: { total: commissionTotal.toFixed(2), count: commissionPayments.length, byReceptionist: [...commissionTotals].map(([name, amount]) => ({ name, amount: amount.toFixed(2) })) },
      trends,
      trendMode,
      restaurantStock: restaurantStock.map((item) => ({ id: item.id, name: item.name, category: item.category, active: item.active, quantity: item.stockQuantity?.toFixed(2) ?? null, unit: item.stockUnit, alertAt: item.stockAlertAt?.toFixed(2) ?? null, lastCount: item.stockCounts[0] ? { by: item.stockCounts[0].countedByName, at: item.stockCounts[0].createdAt } : null })),
      rooms: { ...roomCounts, occupancyRate: roomCounts.total ? Math.round(roomCounts.occupied / roomCounts.total * 100) : 0 },
      operations: { arrivals, departures, pendingReservations: statusCount('PENDING'), confirmedReservations: statusCount('CONFIRMED'), cancelledReservations: statusCount('CANCELLED'), activeStays: activeStays.length },
      restaurant: {
        orderAmount: restaurantSales.toFixed(2), paidAmount: restaurantPaid.toFixed(2), salesByServer,
        breakfastAssociations: { count: breakfastAssociations._count.id, amount: breakfastAssociations._sum.amount?.toFixed(2) ?? '0.00' },
        lodged: guestTypeStats(lodgedSales, lodgedPaid), nonLodged: guestTypeStats(nonLodgedSales, nonLodgedPaid),
        pending: restaurantCount('PENDING_RECEPTION'), confirmed: restaurantCount('CONFIRMED'), preparing: restaurantCount('PREPARING'), ready: restaurantCount('READY'), served: restaurantCount('SERVED'), rejected: restaurantCount('REJECTED'),
        orders: restaurantStatuses.reduce((sum, item) => sum + item._count._all, 0),
        recentOrders: restaurantActivity.slice(0, 20).map((order) => ({ ...order, totalAmount: order.totalAmount.toFixed(2), room: order.room })),
        note: 'Les commandes non logées sont encaissées immédiatement, tandis que les commandes des clients hébergés sont portées aux folios après validation en réception.',
      },
      cash: { closedSessions: cashAggregate._count.id, variance: variance.toFixed(2), discrepancies: cashDiscrepancies.map((item) => ({ id: item.id, amount: item.variance?.toFixed(2) ?? '0.00', closedAt: item.closedAt, operator: item.user.name })) },
      debts: balances.sort((a, b) => b.balance.comparedTo(a.balance)).slice(0, 10).map(({ folio, billed, paid, balance }) => ({ reference: folio.reservation?.reference ?? 'Séjour', client: folio.reservation?.client.name ?? 'Client', room: folio.reservation?.room?.number ?? null, billed: billed.toFixed(2), paid: paid.toFixed(2), balance: balance.toFixed(2) })),
      staff: { activeAccounts: activeUsers, recentAccounts: recentUsers.map((user) => ({ id: user.id, name: user.name, role: user.role?.name ?? 'Sans rôle', active: user.active, lastLoginAt: user.lastLoginAt })) },
      audit: recentEvents.map((event) => ({ ...event, actor: event.actorId ? actorNames.get(event.actorId) ?? 'Compte indisponible' : 'Système' })),
      alerts: [
        ...(roomCounts.outOfService ? [{ type: 'rooms', label: `${roomCounts.outOfService} chambre(s) hors service` }] : []),
        ...(roomCounts.dirty ? [{ type: 'housekeeping', label: `${roomCounts.dirty} chambre(s) à nettoyer ou inspecter` }] : []),
        ...(balances.length ? [{ type: 'debts', label: `${balances.length} folio(s) ouvert(s) avec un solde · ${outstanding.toFixed(2)} ${configuration.currency}` }] : []),
        ...(cashDiscrepancies.length ? [{ type: 'cash', label: `${cashDiscrepancies.length} écart(s) de caisse sur la période` }] : []),
      ],
      availability: { bankReconciliation: 'not_configured', generalExpenseLedger: 'not_configured', tariffHistory: 'not_configured', attendance: 'not_configured', aiAssistant: 'not_configured', exportExcel: 'not_configured' },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

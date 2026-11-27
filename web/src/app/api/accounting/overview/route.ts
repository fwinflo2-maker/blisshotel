import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { folioTotals, hotelDateKey, parseDateOnly, parseHotelDateTime } from '@/server/reception';
import { hotelConfiguration } from '@/server/hotel';

export const instant = false;

export async function GET(request: Request) {
  try {
    const scope = await authorizedScope('accounting.view');
    const params = new URL(request.url).searchParams;
    const configuration = await hotelConfiguration();
    const today = hotelDateKey(new Date(), configuration.timezone);
    const fromText = params.get('from') ?? `${today.slice(0, 7)}-01`;
    const toText = params.get('to') ?? today;
    let fromDate: Date;
    let endDate: Date;
    try {
      fromDate = parseDateOnly(fromText);
      endDate = parseDateOnly(toText);
    } catch (error) {
      if (error instanceof AppError) return NextResponse.json({ error: 'Période de consultation invalide.' }, { status: 400 });
      throw error;
    }
    const oldestAllowed = new Date(endDate);
    oldestAllowed.setUTCFullYear(oldestAllowed.getUTCFullYear() - 99);
    if (fromDate > endDate || fromDate < oldestAllowed) return NextResponse.json({ error: 'La période doit être valide et ne pas dépasser 99 ans.' }, { status: 400 });
    const from = parseHotelDateTime(`${fromText}T00:00`, configuration.timezone);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const until = parseHotelDateTime(`${endDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);

    const expenseWhere = { report: { is: { shiftDate: { gte: fromDate, lt: endDate } } } };
    const [invoices, payments, openFolios, cashSessions, recentPayments, expenseAggregate, recentExpenses, restaurantOrders, restaurantStock, restaurantServed, restaurantSalesTotals, paidRestaurantTotals, paidRestaurantOrders, restaurantByServerRows, directCollectedByServer, lodgedRestaurantSales, nonLodgedRestaurantSales] = await Promise.all([
      db.invoice.aggregate({ where: { issuedAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { totalAmount: true } }),
      db.payment.aggregate({ where: { createdAt: { gte: from, lt: until }, restaurantOrderId: null, amount: { gt: 0 } }, _count: { id: true }, _sum: { amount: true } }),
      db.folio.findMany({ where: { status: 'OPEN' }, include: { lines: { select: { amount: true } }, payments: { select: { amount: true } }, invoice: { select: { issuedAt: true } }, reservation: { select: { client: { select: { name: true } } } } } }),
      db.cashSession.findMany({ where: { status: 'CLOSED', closedAt: { gte: from, lt: until } }, orderBy: { closedAt: 'desc' }, take: 100, select: { id: true, openedAt: true, closedAt: true, shiftType: true, shiftStartedAt: true, shiftEndedAt: true, openingAmount: true, expectedCash: true, countedAmount: true, variance: true, user: { select: { name: true } } } }),
      db.payment.findMany({ where: { createdAt: { gte: from, lt: until }, restaurantOrderId: null, amount: { gt: 0 } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, amount: true, reference: true, createdAt: true, receivedBy: true, paymentMethod: { select: { name: true } }, client: { select: { name: true } }, folio: { select: { reservation: { select: { reference: true, client: { select: { name: true } } } } } } } }),
      db.receptionShiftExpense.aggregate({
        where: expenseWhere,
        _count: { id: true },
        _sum: { amount: true },
      }),
      db.receptionShiftExpense.findMany({
        where: expenseWhere,
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          description: true,
          amount: true,
          createdAt: true,
          paymentMethod: { select: { name: true } },
          report: { select: { shiftType: true, user: { select: { name: true } } } },
        },
      }),
      db.restaurantOrder.findMany({ where: { createdAt: { gte: from, lt: until } }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, number: true, guestName: true, source: true, status: true, totalAmount: true, createdAt: true, createdByName: true, paidAt: true, paidByName: true, paymentMethod: { select: { id: true, code: true, name: true } }, room: { select: { number: true } }, lines: { select: { name: true, category: true, quantity: true, lineTotal: true } } } }),
      db.restaurantMenuItem.findMany({ where: { billingUnit: 'ITEM', category: { in: ['DRINK', 'SOFT_DRINK', 'JUICE', 'WATER', 'BEER', 'WINE', 'WHISKY', 'SPIRIT', 'COCKTAIL'] }, OR: [{ deletedAt: null }, { stockCounts: { some: { createdAt: { gte: from, lt: until } } } }] }, select: { id: true, name: true, category: true, deletedAt: true, stockQuantity: true, stockUnit: true, stockAlertAt: true, stockCounts: { where: { createdAt: { gte: from, lt: until } }, orderBy: { createdAt: 'desc' }, select: { countedQuantity: true, previousQuantity: true, countedByName: true, createdAt: true, note: true } } }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED' }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, status: { not: 'REJECTED' } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.aggregate({ where: { paidAt: { gte: from, lt: until } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.findMany({ where: { paidAt: { gte: from, lt: until } }, orderBy: { paidAt: 'desc' }, take: 10, select: { id: true, number: true, guestName: true, totalAmount: true, paidAt: true, paidByName: true, createdByName: true, paymentMethod: { select: { name: true } } } }),
      db.restaurantOrder.groupBy({ by: ['createdByName', 'status'], where: { createdAt: { gte: from, lt: until }, status: 'SERVED' }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.groupBy({ by: ['createdByName'], where: { paidAt: { gte: from, lt: until } }, _sum: { totalAmount: true } }),
      db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED', reservationId: { not: null } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED', reservationId: null }, _sum: { totalAmount: true }, _count: { id: true } }),
    ]);
    const commissionPayments = await db.payment.findMany({ where: { createdAt: { gte: from, lt: until }, description: { startsWith: 'Commission réservation' }, amount: { lt: 0 } }, select: { amount: true, receivedBy: true } });
    const commissionUserIds = [...new Set(commissionPayments.map((payment) => payment.receivedBy))];
    const commissionUsers = await db.user.findMany({ where: { id: { in: commissionUserIds } }, select: { id: true, name: true } });
    const commissionNames = new Map(commissionUsers.map((user) => [user.id, user.name]));
    const commissionTotals = new Map<string, Prisma.Decimal>();
    for (const payment of commissionPayments) {
      const name = commissionNames.get(payment.receivedBy) ?? 'Inconnu';
      commissionTotals.set(name, (commissionTotals.get(name) ?? new Prisma.Decimal(0)).add(payment.amount.abs()));
    }
    const commissionTotal = commissionPayments.reduce((sum, payment) => sum.add(payment.amount.abs()), new Prisma.Decimal(0));
    const frontDeskActivity = await db.auditLog.findMany({ where: { action: { in: ['RECEPTION_STAY_CHECK_IN', 'RECEPTION_STAY_CHECK_OUT'] }, result: 'SUCCESS', createdAt: { gte: from, lt: until } }, orderBy: { createdAt: 'desc' }, take: 50, select: { action: true, actorId: true, targetId: true, createdAt: true } });
    const frontDeskUserIds = [...new Set(frontDeskActivity.flatMap((event) => event.actorId ? [event.actorId] : []))];
    const frontDeskUsers = await db.user.findMany({ where: { id: { in: frontDeskUserIds } }, select: { id: true, name: true } });
    const frontDeskNames = new Map(frontDeskUsers.map((user) => [user.id, user.name]));
    const [trendInvoices, trendRestaurant, trendLodging] = await Promise.all([
      db.invoice.findMany({ where: { issuedAt: { gte: from, lt: until } }, select: { issuedAt: true, totalAmount: true } }),
      db.restaurantOrder.findMany({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED' }, select: { createdAt: true, totalAmount: true } }),
      db.folioLine.findMany({ where: { type: 'ACCOMMODATION', createdAt: { gte: from, lt: until } }, select: { createdAt: true, amount: true } }),
    ]);
    const breakfastAssociations = await db.folioLine.aggregate({ where: { type: 'SERVICE', description: 'Petit-déjeuner', createdAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { amount: true } });
    const spanDays = Math.ceil((until.getTime() - from.getTime()) / 86_400_000);
    const bucket = (date: Date) => {
      if (spanDays <= 31) return date.toISOString().slice(0, 10);
      if (spanDays <= 183) { const monday = new Date(date); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); return monday.toISOString().slice(0, 10); }
      if (spanDays <= 3660) return date.toISOString().slice(0, 7);
      return date.toISOString().slice(0, 4);
    };
    const trendMap = new Map<string, { lodging: number; invoiced: number; restaurant: number; reservations: number }>();
    for (const invoice of trendInvoices) { const key = bucket(invoice.issuedAt); const point = trendMap.get(key) ?? { lodging: 0, invoiced: 0, restaurant: 0, reservations: 0 }; point.invoiced += Number(invoice.totalAmount); trendMap.set(key, point); }
    for (const order of trendRestaurant) { const key = bucket(order.createdAt); const point = trendMap.get(key) ?? { lodging: 0, invoiced: 0, restaurant: 0, reservations: 0 }; point.restaurant += Number(order.totalAmount); trendMap.set(key, point); }
    for (const line of trendLodging) { const key = bucket(line.createdAt); const point = trendMap.get(key) ?? { lodging: 0, invoiced: 0, restaurant: 0, reservations: 0 }; point.lodging += Number(line.amount); trendMap.set(key, point); }
    const trends = [...trendMap].sort(([a], [b]) => a.localeCompare(b)).map(([period, values]) => ({ period, ...values }));
    const openBalances = openFolios.map(folioTotals).reduce((total, folio) => total.add(folio.balance), new Prisma.Decimal(0));
    const receivablesAging = [0, 0, 0, 0].map(() => ({ count: 0, amount: new Prisma.Decimal(0) }));
    for (const folio of openFolios) {
      const balance = folioTotals(folio).balance;
      if (balance.lte(0)) continue;
      const issuedAt = folio.invoice?.issuedAt ?? folio.createdAt;
      const ageDays = Math.max(0, Math.floor((Date.now() - issuedAt.getTime()) / 86_400_000));
      const bucketIndex = ageDays <= 30 ? 0 : ageDays <= 60 ? 1 : ageDays <= 90 ? 2 : 3;
      receivablesAging[bucketIndex].count++;
      receivablesAging[bucketIndex].amount = receivablesAging[bucketIndex].amount.add(balance);
    }
    const directRestaurantCollected = paidRestaurantTotals._sum.totalAmount ?? new Prisma.Decimal(0);
    const restaurantByServer = new Map<string, { served: number; sales: Prisma.Decimal; collected: Prisma.Decimal }>();
    for (const row of restaurantByServerRows) {
      const current = restaurantByServer.get(row.createdByName) ?? { served: 0, sales: new Prisma.Decimal(0), collected: new Prisma.Decimal(0) };
      current.served += row._count.id;
      current.sales = current.sales.add(row._sum.totalAmount ?? 0);
      restaurantByServer.set(row.createdByName, current);
    }
    for (const row of directCollectedByServer) {
      const current = restaurantByServer.get(row.createdByName) ?? { served: 0, sales: new Prisma.Decimal(0), collected: new Prisma.Decimal(0) };
      current.collected = current.collected.add(row._sum.totalAmount ?? 0);
      restaurantByServer.set(row.createdByName, current);
    }

    return NextResponse.json({
      period: { from: from.toISOString(), to: until.toISOString() },
      trends,
      summary: {
        invoicesCount: invoices._count.id,
        invoicedAmount: invoices._sum.totalAmount?.toFixed(2) ?? '0.00',
        paymentsCount: payments._count.id + paidRestaurantTotals._count.id,
        collectedAmount: (payments._sum.amount ?? new Prisma.Decimal(0)).add(directRestaurantCollected).toFixed(2),
        expensesCount: expenseAggregate._count.id + commissionPayments.length,
        expensesAmount: (expenseAggregate._sum.amount ?? new Prisma.Decimal(0)).add(commissionTotal).toFixed(2),
        openFoliosCount: openFolios.length,
        outstandingBalance: openBalances.toFixed(2),
        receivablesAging: receivablesAging.map((bucket) => ({ count: bucket.count, amount: bucket.amount.toFixed(2) })),
        closedCashSessions: cashSessions.length,
        cashVariance: cashSessions.reduce((total, session) => total.add(session.variance ?? 0), new Prisma.Decimal(0)).toFixed(2),
        commissions: { total: commissionTotal.toFixed(2), count: commissionPayments.length, byReceptionist: [...commissionTotals].map(([name, amount]) => ({ name, amount: amount.toFixed(2) })) },
      },
      frontDeskActivity: frontDeskActivity.map((event) => ({ action: event.action, at: event.createdAt.toISOString(), receptionist: frontDeskNames.get(event.actorId ?? '') ?? 'Inconnu', reservationId: event.targetId })),
      recentPayments: [...recentPayments.map((payment) => ({
        id: payment.id,
        amount: payment.amount.toFixed(2),
        reference: payment.reference,
        createdAt: payment.createdAt,
        receivedBy: payment.receivedBy,
        method: payment.paymentMethod.name,
        reservation: payment.folio?.reservation?.reference ?? 'Paiement direct',
        client: payment.folio?.reservation?.client.name ?? payment.client?.name ?? '—',
      })), ...paidRestaurantOrders.map((order) => ({ id: order.id, amount: order.totalAmount.toFixed(2), reference: order.number, createdAt: order.paidAt!, receivedBy: order.paidByName ?? order.createdByName, method: order.paymentMethod?.name ?? 'Moyen désactivé', reservation: 'Vente bar-restaurant', client: order.guestName }))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10),
      recentExpenses: recentExpenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        amount: expense.amount.toFixed(2),
        createdAt: expense.createdAt,
        method: expense.paymentMethod.name,
        shiftType: expense.report.shiftType,
        operator: expense.report.user.name,
      })),
      restaurant: {
        orderCount: restaurantSalesTotals._count.id,
        servedCount: restaurantServed._count.id,
        breakfastAssociations: { count: breakfastAssociations._count.id, amount: breakfastAssociations._sum.amount?.toFixed(2) ?? '0.00' },
        salesAmount: restaurantServed._sum.totalAmount?.toFixed(2) ?? '0.00',
        totalOrderAmount: restaurantSalesTotals._sum.totalAmount?.toFixed(2) ?? '0.00',
        lodgedSales: { orders: lodgedRestaurantSales._count.id, amount: lodgedRestaurantSales._sum.totalAmount?.toFixed(2) ?? '0.00' },
        nonLodgedSales: { orders: nonLodgedRestaurantSales._count.id, amount: nonLodgedRestaurantSales._sum.totalAmount?.toFixed(2) ?? '0.00' },
        paidAmount: directRestaurantCollected.toFixed(2),
        salesByServer: [...restaurantByServer.entries()].map(([name, row]) => ({ name, orders: row.served, served: row.served, sales: row.sales.toFixed(2), collected: row.collected.toFixed(2) })),
        orders: restaurantOrders.map((order) => ({ ...order, totalAmount: order.totalAmount.toFixed(2), createdAt: order.createdAt.toISOString(), room: order.room?.number ?? null, lines: order.lines.map((line) => ({ ...line, lineTotal: line.lineTotal.toFixed(2) })) })),
        stock: restaurantStock.map((item) => ({ id: item.id, name: item.name, deleted: item.deletedAt !== null, quantity: item.stockQuantity?.toFixed(2) ?? null, unit: item.stockUnit, alertAt: item.stockAlertAt?.toFixed(2) ?? null, counts: item.stockCounts.map((count) => ({ quantity: count.countedQuantity.toFixed(2), previousQuantity: count.previousQuantity?.toFixed(2) ?? null, by: count.countedByName, at: count.createdAt.toISOString(), note: count.note })) })),
      },
      cashSessions: cashSessions.map((session) => ({ ...session, openingAmount: session.openingAmount.toFixed(2), expectedCash: session.expectedCash?.toFixed(2) ?? null, countedAmount: session.countedAmount?.toFixed(2) ?? null, variance: session.variance?.toFixed(2) ?? null })),
      permissions: scope.permissions,
      modules: { expenses: 'reception_shift_reports', bankReconciliation: 'not_configured' },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

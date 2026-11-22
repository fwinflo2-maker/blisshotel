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
    if (fromDate > endDate) return NextResponse.json({ error: 'Période de consultation invalide.' }, { status: 400 });
    const from = parseHotelDateTime(`${fromText}T00:00`, configuration.timezone);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const until = parseHotelDateTime(`${endDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);

    const expenseWhere = { report: { is: { shiftDate: { gte: fromDate, lt: endDate } } } };
    const [invoices, payments, openFolios, cashSessions, recentPayments, expenseAggregate, recentExpenses] = await Promise.all([
      db.invoice.aggregate({ where: { issuedAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { totalAmount: true } }),
      db.payment.aggregate({ where: { createdAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { amount: true } }),
      db.folio.findMany({ where: { status: 'OPEN' }, include: { lines: { select: { amount: true } }, payments: { select: { amount: true } } } }),
      db.cashSession.findMany({ where: { status: 'CLOSED', closedAt: { gte: from, lt: until } }, orderBy: { closedAt: 'desc' }, take: 100, select: { id: true, openedAt: true, closedAt: true, openingAmount: true, expectedCash: true, countedAmount: true, variance: true, user: { select: { name: true } } } }),
      db.payment.findMany({ where: { createdAt: { gte: from, lt: until } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, amount: true, reference: true, createdAt: true, receivedBy: true, paymentMethod: { select: { name: true } }, client: { select: { name: true } }, folio: { select: { reservation: { select: { reference: true, client: { select: { name: true } } } } } } } }),
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
    ]);
    const openBalances = openFolios.map(folioTotals).reduce((total, folio) => total.add(folio.balance), new Prisma.Decimal(0));

    return NextResponse.json({
      period: { from: from.toISOString(), to: until.toISOString() },
      summary: {
        invoicesCount: invoices._count.id,
        invoicedAmount: invoices._sum.totalAmount?.toFixed(2) ?? '0.00',
        paymentsCount: payments._count.id,
        collectedAmount: payments._sum.amount?.toFixed(2) ?? '0.00',
        expensesCount: expenseAggregate._count.id,
        expensesAmount: expenseAggregate._sum.amount?.toFixed(2) ?? '0.00',
        openFoliosCount: openFolios.length,
        outstandingBalance: openBalances.toFixed(2),
        closedCashSessions: cashSessions.length,
        cashVariance: cashSessions.reduce((total, session) => total.add(session.variance ?? 0), new Prisma.Decimal(0)).toFixed(2),
      },
      recentPayments: recentPayments.map((payment) => ({
        id: payment.id,
        amount: payment.amount.toFixed(2),
        reference: payment.reference,
        createdAt: payment.createdAt,
        receivedBy: payment.receivedBy,
        method: payment.paymentMethod.name,
        reservation: payment.folio?.reservation?.reference ?? 'Paiement direct',
        client: payment.folio?.reservation?.client.name ?? payment.client?.name ?? '—',
      })),
      recentExpenses: recentExpenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        amount: expense.amount.toFixed(2),
        createdAt: expense.createdAt,
        method: expense.paymentMethod.name,
        shiftType: expense.report.shiftType,
        operator: expense.report.user.name,
      })),
      cashSessions: cashSessions.map((session) => ({ ...session, openingAmount: session.openingAmount.toFixed(2), expectedCash: session.expectedCash?.toFixed(2) ?? null, countedAmount: session.countedAmount?.toFixed(2) ?? null, variance: session.variance?.toFixed(2) ?? null })),
      permissions: scope.permissions,
      modules: { expenses: 'reception_shift_reports', bankReconciliation: 'not_configured' },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

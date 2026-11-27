import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError, assertOwnCashSession } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { hotelDateKey, notifyReceptionStaff, parseDateOnly, folioTotals } from '@/server/reception';
import { shiftReportInclude } from '@/server/shift-reports';
import { calculateCashDrawer } from '@/features/shift-reports/domain';
import { convertToXaf } from '@/server/currency';

export const instant = false;

function sessionSummary(session: {
  id: string;
  status: string;
  openingAmount: Prisma.Decimal;
  countedAmount: Prisma.Decimal | null;
  expectedCash: Prisma.Decimal | null;
  variance: Prisma.Decimal | null;
  openedAt: Date;
  closedAt: Date | null;
  payments: {
    id: string;
    amount: Prisma.Decimal;
    reference: string | null;
    description: string | null;
    createdAt: Date;
    paymentMethod: { code: string; name: string };
    client?: { name: string } | null;
    folio?: { reservation?: { reference: string; client?: { name: string } | null } | null } | null;
  }[];
}) {
  const methods = new Map<string, { name: string; amount: Prisma.Decimal }>();
  const cashPayments = session.payments
    .filter((payment) => payment.paymentMethod.code === 'CASH')
    .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
  for (const payment of session.payments) {
    const current = methods.get(payment.paymentMethod.code) ?? { name: payment.paymentMethod.name, amount: new Prisma.Decimal(0) };
    current.amount = current.amount.add(payment.amount);
    methods.set(payment.paymentMethod.code, current);
  }
  const expectedCash = session.expectedCash ?? session.openingAmount.add(cashPayments);
  return {
    id: session.id,
    status: session.status,
    openingAmount: session.openingAmount.toFixed(2),
    expectedCash: expectedCash.toFixed(2),
    countedAmount: session.countedAmount?.toFixed(2) ?? null,
    variance: session.variance?.toFixed(2) ?? null,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    transactions: session.payments.slice(0, 100).map((payment) => ({
      id: payment.id,
      amount: payment.amount.toFixed(2),
      method: payment.paymentMethod.name,
      methodCode: payment.paymentMethod.code,
      reference: payment.reference,
      description: payment.description,
      createdAt: payment.createdAt,
      reservationReference: payment.folio?.reservation?.reference ?? null,
      clientName: payment.client?.name ?? payment.folio?.reservation?.client?.name ?? null,
    })),
    paymentsByMethod: [...methods].map(([code, value]) => ({ code, name: value.name, amount: value.amount.toFixed(2) })),
  };
}

const sessionInclude = {
  payments: {
    orderBy: { createdAt: 'desc' } as const,
    include: {
      paymentMethod: { select: { code: true, name: true } },
      client: { select: { name: true } },
      folio: { include: { reservation: { select: { reference: true, client: { select: { name: true } } } } } },
    },
  },
} satisfies Prisma.CashSessionInclude;

export async function GET() {
  try {
    const scope = await authorizedScope('cash_sessions.view_own');
    const sessions = await db.cashSession.findMany({
      where: { userId: scope.userId },
      orderBy: { openedAt: 'desc' },
      take: 10,
      include: sessionInclude,
    });
    return NextResponse.json({
      sessions: sessions.map((session) => {
        assertOwnCashSession(scope, session);
        return sessionSummary(session);
      }),
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

const moneyAmount = z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/);

const openSchema = z.object({
  openingAmount: moneyAmount,
});

export async function POST(request: Request) {
  try {
    const parsed = openSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Le fonds initial doit être un montant positif valide.' }, { status: 400 });
    const scope = await authorizedScope('cash_sessions.open_own');
    const configuration = await hotelConfiguration();
    const openingAmount = await convertToXaf(parsed.data.openingAmount, configuration.currency);
    const activeKey = scope.userId;
    const session = await db.$transaction(async (tx) => {
      const active = await tx.cashSession.findFirst({ where: { activeKey }, select: { id: true } });
      if (active) throw new AppError(409, 'Vous avez déjà une session de caisse ouverte dans cet établissement.');
      const created = await tx.cashSession.create({
        data: {
          userId: scope.userId,
          activeKey,
          openingAmount,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_CASH_SESSION_OPEN',
          result: 'SUCCESS',
          targetId: created.id,
          details: {
            openingAmount: created.openingAmount.toFixed(2),
            inputAmount: parsed.data.openingAmount,
            inputCurrency: configuration.currency,
          },
        },
      });
      return created;
    });
    return NextResponse.json({ session: sessionSummary({ ...session, payments: [] }) }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Une session de caisse est déjà ouverte pour votre compte.' }, { status: 409 });
    }
    throw error;
  }
}

const closeSchema = z.object({
  sessionId: z.string().min(1),
  countedAmount: moneyAmount,
  shiftType: z.enum(['DAY', 'NIGHT']),
  incidentNotes: z.string().trim().max(2000).optional().default(''),
  handoverNotes: z.string().trim().max(2000).optional().default(''),
  expenses: z.array(z.object({
    description: z.string().trim().min(2).max(200),
    amount: moneyAmount,
    paymentMethodId: z.string().min(1),
  })).max(30).default([]),
});

export async function PATCH(request: Request) {
  try {
    const parsed = closeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Le montant compté est invalide.' }, { status: 400 });
    const scope = await authorizedScope('cash_sessions.close_own');
    if (!scope.permissions.includes('shift_reports.view')) {
      throw new AppError(403, 'La permission de consulter et produire le rapport de service est requise pour clôturer la caisse.');
    }
    const configuration = await hotelConfiguration();
    const countedAmountXaf = await convertToXaf(parsed.data.countedAmount, configuration.currency);
    const expensesWithAmounts = await Promise.all(parsed.data.expenses.map(async (expense) => ({
      ...expense,
      amountDecimal: await convertToXaf(expense.amount, configuration.currency),
    })));
    const session = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM CashSession
        WHERE id = ${parsed.data.sessionId}
          AND userId = ${scope.userId}
        FOR UPDATE
      `;
      if (!locked.length) throw new AppError(404, 'Votre session de caisse est introuvable.');
      const current = await tx.cashSession.findFirst({
        where: { id: parsed.data.sessionId, userId: scope.userId, status: 'OPEN' },
        include: sessionInclude,
      });
      if (!current) throw new AppError(409, 'Cette session est déjà clôturée.');
      assertOwnCashSession(scope, current);
      const uniqueMethodIds = [...new Set(parsed.data.expenses.map((expense) => expense.paymentMethodId))];
      const paymentMethods = uniqueMethodIds.length ? await tx.paymentMethod.findMany({
        where: { id: { in: uniqueMethodIds }, active: true },
        select: { id: true, code: true, name: true },
      }) : [];
      if (paymentMethods.length !== uniqueMethodIds.length) throw new AppError(400, 'Un moyen de paiement des dépenses est inactif ou invalide.');
      const paymentMethodById = new Map(paymentMethods.map((method) => [method.id, method]));
      const expenses = expensesWithAmounts.map((expense) => {
        const paymentMethod = paymentMethodById.get(expense.paymentMethodId);
        if (!paymentMethod) throw new AppError(400, 'Un moyen de paiement des dépenses est inactif ou invalide.');
        return { ...expense, paymentMethod };
      });
      if (expenses.some((expense) => !expense.amountDecimal.gt(0))) {
        throw new AppError(400, 'Chaque dépense doit avoir un montant supérieur à zéro.');
      }
      const cashDrawer = calculateCashDrawer(
        current.openingAmount.toFixed(2),
        current.payments.map((payment) => ({
          amount: payment.amount.toFixed(2),
          paymentMethodCode: payment.paymentMethod.code,
        })),
        expenses.map((expense) => ({
          amount: expense.amountDecimal.toFixed(2),
          paymentMethodCode: expense.paymentMethod.code,
        })),
      );
      if (!cashDrawer.canCoverExpenses) {
        throw new AppError(409, 'Les dépenses payées en espèces dépassent le fonds initial et les encaissements en espèces.');
      }
      const cashPayments = new Prisma.Decimal(cashDrawer.cashReceived);
      const cashExpenses = new Prisma.Decimal(cashDrawer.cashExpenses);
      const expectedCash = new Prisma.Decimal(cashDrawer.expectedCash);
      const countedAmount = countedAmountXaf;
      const closedAt = new Date();
      const activity = await tx.auditLog.groupBy({
        by: ['action'],
        where: {
          actorId: scope.userId,
          result: 'SUCCESS',
          action: { startsWith: 'RECEPTION_' },
          createdAt: { gte: current.openedAt, lte: closedAt },
        },
        _count: { _all: true },
      });
      const activityCount = new Map(activity.map((item) => [item.action, item._count._all]));
      const stayActivity = await tx.stay.findMany({
        where: {
          OR: [
            { checkedInBy: scope.userId, checkInRecordedAt: { gte: current.openedAt, lte: closedAt } },
            { checkedOutBy: scope.userId, checkOutRecordedAt: { gte: current.openedAt, lte: closedAt } },
          ],
        },
        select: {
          checkInRecordedAt: true,
          checkOutRecordedAt: true,
          checkedInBy: true,
          checkedOutBy: true,
          reservation: {
            select: {
              reference: true,
              client: { select: { name: true } },
              room: { select: { number: true } },
            },
          },
        },
      });
      const checkInEvents = stayActivity
        .filter((stay) => stay.checkedInBy === scope.userId && stay.checkInRecordedAt)
        .map((stay) => ({ reference: stay.reservation.reference, clientName: stay.reservation.client.name, roomNumber: stay.reservation.room?.number ?? null, recordedAt: stay.checkInRecordedAt!.toISOString() }));
      const checkOutEvents = stayActivity
        .filter((stay) => stay.checkedOutBy === scope.userId && stay.checkOutRecordedAt)
        .map((stay) => ({ reference: stay.reservation.reference, clientName: stay.reservation.client.name, roomNumber: stay.reservation.room?.number ?? null, recordedAt: stay.checkOutRecordedAt!.toISOString() }));
      const [roomStatuses, housekeepingStatuses, openFolios] = await Promise.all([
        tx.room.groupBy({ by: ['status'], _count: { _all: true } }),
        tx.room.groupBy({ by: ['housekeepingStatus'], _count: { _all: true } }),
        tx.folio.findMany({
          where: { status: 'OPEN' },
          include: { lines: { select: { amount: true } }, payments: { select: { amount: true } } },
        }),
      ]);
      const openFolioBalance = openFolios.reduce(
        (sum, folio) => sum.add(folioTotals(folio).balance),
        new Prisma.Decimal(0),
      );
      const clientPayments = current.payments.filter((payment) => payment.amount.gt(0));
      const totalPayments = clientPayments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      const commissionPayments = current.payments.filter((payment) => payment.description?.startsWith('Commission réservation'));
      const commissionsTotal = commissionPayments.reduce((sum, payment) => sum.add(payment.amount.abs()), new Prisma.Decimal(0));
      const commissionEntries = commissionPayments.map((payment) => ({
        reservationReference: payment.reference ?? payment.description?.replace('Commission réservation ', '') ?? 'Réservation',
        amount: payment.amount.abs().toFixed(2),
        createdAt: payment.createdAt.toISOString(),
      }));
      const paymentsByMethod = new Map<string, { name: string; amount: Prisma.Decimal }>();
      for (const payment of clientPayments) {
        const method = paymentsByMethod.get(payment.paymentMethod.code) ?? {
          name: payment.paymentMethod.name,
          amount: new Prisma.Decimal(0),
        };
        method.amount = method.amount.add(payment.amount);
        paymentsByMethod.set(payment.paymentMethod.code, method);
      }
      const totalExpenses = expenses.reduce((sum, expense) => sum.add(expense.amountDecimal), new Prisma.Decimal(0));
      const restaurantOrders = await tx.restaurantOrder.findMany({
        where: { confirmedAt: { gte: current.openedAt, lte: closedAt }, status: { not: 'REJECTED' } },
        include: { lines: { select: { category: true, lineTotal: true } } },
      });
      const reservationsDuringShift = await tx.reservation.findMany({
        where: { createdBy: scope.userId, createdAt: { gte: current.openedAt, lte: closedAt } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          reference: true,
          totalAmount: true,
          createdAt: true,
          room: { select: { number: true } },
          client: {
            select: {
              id: true,
              name: true,
              createdByName: true,
              creator: { select: { name: true } },
            },
          },
          folio: {
            select: {
              payments: { select: { amount: true } },
            },
          },
        },
      });
      const reservedClients = new Map<string, { name: string; registeredBy: string; references: string[]; rooms: string[]; paid: boolean }>();
      for (const reservation of reservationsDuringShift) {
        const paidAmount = reservation.folio?.payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0)) ?? new Prisma.Decimal(0);
        const isPaid = paidAmount.gte(reservation.totalAmount);
        const existing = reservedClients.get(reservation.client.id);
        if (existing) {
          existing.references.push(reservation.reference);
          existing.rooms.push(reservation.room?.number ?? 'Non attribuée');
          existing.paid &&= isPaid;
        } else {
          reservedClients.set(reservation.client.id, {
            name: reservation.client.name,
            registeredBy: reservation.client.createdByName ?? reservation.client.creator?.name ?? 'Non renseigné',
            references: [reservation.reference],
            rooms: [reservation.room?.number ?? 'Non attribuée'],
            paid: isPaid,
          });
        }
      }
      const invoicesSettledDuringShift = await tx.payment.findMany({
        where: { cashSessionId: current.id, createdAt: { gte: current.openedAt, lte: closedAt }, folio: { isNot: null } },
        select: {
          createdAt: true,
          cashSessionId: true,
          folio: {
            select: {
              invoice: { select: { number: true, totalAmount: true, issuedAt: true } },
              payments: { select: { amount: true, cashSessionId: true } },
              reservation: { select: {
                reference: true,
                room: { select: { number: true } },
                client: { select: { id: true, name: true, createdByName: true, creator: { select: { name: true } } } },
              } },
            },
          },
        },
      });
      const settledInvoices = new Map<string, { invoiceNumber: string; clientName: string; registeredBy: string; reference: string; roomNumber: string | null; settledAt: Date }>();
      for (const payment of invoicesSettledDuringShift) {
        const folio = payment.folio;
        const invoice = folio?.invoice;
        if (!folio || !invoice || invoice.issuedAt >= current.openedAt) continue;
        const paidBeforeShift = folio.payments.filter((item) => item.cashSessionId !== current.id).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        const paidAfter = folio.payments.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        if (paidBeforeShift.gte(invoice.totalAmount) || !paidAfter.gte(invoice.totalAmount)) continue;
        const client = folio.reservation.client;
        const existing = settledInvoices.get(invoice.number);
        if (!existing || payment.createdAt > existing.settledAt) settledInvoices.set(invoice.number, {
          invoiceNumber: invoice.number,
          clientName: client.name,
          registeredBy: client.createdByName ?? client.creator?.name ?? 'Non renseigné',
          reference: folio.reservation.reference,
          roomNumber: folio.reservation.room?.number ?? null,
          settledAt: payment.createdAt,
        });
      }
      const restaurantTotals = restaurantOrders.reduce((totals, order) => {
        totals.total = totals.total.add(order.totalAmount);
        for (const line of order.lines) {
          if (line.category === 'FOOD') totals.food = totals.food.add(line.lineTotal);
          if (line.category === 'DRINK') totals.drink = totals.drink.add(line.lineTotal);
          if (line.category === 'BREAKFAST') totals.breakfast = totals.breakfast.add(line.lineTotal);
        }
        return totals;
      }, { total: new Prisma.Decimal(0), food: new Prisma.Decimal(0), drink: new Prisma.Decimal(0), breakfast: new Prisma.Decimal(0) });
      const variance = countedAmount.sub(expectedCash);
      const summary = {
        operations: {
          reservationsCreated: activityCount.get('RECEPTION_RESERVATION_CREATE') ?? 0,
          reservationsConfirmed: activityCount.get('RECEPTION_RESERVATION_CONFIRM') ?? 0,
          reservationsCancelled: activityCount.get('RECEPTION_RESERVATION_CANCEL') ?? 0,
          checkIns: Math.max(checkInEvents.length, (activityCount.get('RECEPTION_STAY_CHECK_IN') ?? 0) + (activityCount.get('RECEPTION_STAY_CHECK_IN_CORRECTED') ?? 0)),
          checkOuts: Math.max(checkOutEvents.length, activityCount.get('RECEPTION_STAY_CHECK_OUT') ?? 0),
        },
        stayOperations: { checkIns: checkInEvents, checkOuts: checkOutEvents },
        reservations: {
          reservationsCount: reservationsDuringShift.length,
          clientsCount: reservedClients.size,
          paidClients: [...reservedClients.values()].filter((client) => client.paid).length,
          unpaidClients: [...reservedClients.values()].filter((client) => !client.paid).length,
          clients: [...reservedClients.values()].map((client) => ({
            name: client.name,
            registeredBy: client.registeredBy,
            references: client.references,
            rooms: [...new Set(client.rooms)],
            paymentStatus: client.paid ? 'PAYE' : 'NON_PAYE',
          })),
        },
        invoicesSettled: {
          count: settledInvoices.size,
          clients: [...settledInvoices.values()].map((item) => ({ ...item, settledAt: item.settledAt.toISOString() })),
        },
        payments: {
          count: clientPayments.length,
          total: totalPayments.toFixed(2),
          byMethod: [...paymentsByMethod].map(([code, method]) => ({
            code,
            name: method.name,
            amount: method.amount.toFixed(2),
          })),
        },
        commissions: {
          count: commissionPayments.length,
          total: commissionsTotal.toFixed(2),
          registeredBy: scope.name,
          entries: commissionEntries,
        },
        cash: {
          openingAmount: current.openingAmount.toFixed(2),
          cashReceived: cashPayments.toFixed(2),
          cashExpenses: cashExpenses.toFixed(2),
          totalExpenses: totalExpenses.toFixed(2),
          expectedCash: expectedCash.toFixed(2),
          countedAmount: countedAmount.toFixed(2),
          variance: variance.toFixed(2),
        },
        restaurant: {
          ordersCount: restaurantOrders.length,
          total: restaurantTotals.total.toFixed(2),
          foodTotal: restaurantTotals.food.toFixed(2),
          drinkTotal: restaurantTotals.drink.toFixed(2),
          breakfastTotal: restaurantTotals.breakfast.toFixed(2),
        },
        rooms: {
          status: roomStatuses.map((item) => ({ status: item.status, count: item._count._all })),
          housekeeping: housekeepingStatuses.map((item) => ({ status: item.housekeepingStatus, count: item._count._all })),
        },
        openFolios: { count: openFolios.length, balance: openFolioBalance.toFixed(2) },
      };
      const updated = await tx.cashSession.update({
        where: { id: current.id },
        data: {
          status: 'CLOSED',
          activeKey: null,
          countedAmount,
          expectedCash,
          variance,
          closedAt,
        },
        include: sessionInclude,
      });
      const report = await tx.receptionShiftReport.create({
        data: {
          cashSessionId: current.id,
          userId: scope.userId,
          shiftType: parsed.data.shiftType,
          shiftDate: parseDateOnly(hotelDateKey(current.openedAt, configuration.timezone)),
          startedAt: current.openedAt,
          endedAt: closedAt,
          summary,
          incidentNotes: parsed.data.incidentNotes || null,
          handoverNotes: parsed.data.handoverNotes || null,
          expenses: {
            create: expenses.map((expense) => ({
              description: expense.description,
              amount: expense.amountDecimal,
              paymentMethodId: expense.paymentMethodId,
            })),
          },
        },
        include: shiftReportInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_CASH_SESSION_CLOSE',
          result: 'SUCCESS',
          targetId: current.id,
          details: {
            expectedCash: expectedCash.toFixed(2),
            countedAmount: countedAmount.toFixed(2),
            countedInput: parsed.data.countedAmount,
            inputCurrency: configuration.currency,
            cashExpenses: cashExpenses.toFixed(2),
            variance: updated.variance?.toFixed(2),
            expenseInputs: parsed.data.expenses.map(({ description, amount, paymentMethodId }) => ({
              description,
              amount,
              paymentMethodId,
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_SHIFT_REPORT_CREATE',
          result: 'SUCCESS',
          targetId: report.id,
          details: {
            cashSessionId: current.id,
            shiftType: parsed.data.shiftType,
            expenses: expenses.length,
            expenseTotal: totalExpenses.toFixed(2),
          },
        },
      });
      if (updated.variance && !updated.variance.isZero()) {
        await notifyReceptionStaff(
          tx,
          [scope.userId],
          `Clôture de caisse enregistrée : écart de ${updated.variance.toFixed(2)} entre le compté (${countedAmount.toFixed(2)}) et le théorique (${expectedCash.toFixed(2)}).`,
        );
      }
      return { session: updated, report };
    });
    return NextResponse.json({
      session: sessionSummary(session.session),
      report: {
        ...session.report,
        shiftDate: session.report.shiftDate.toISOString().slice(0, 10),
        startedAt: session.report.startedAt.toISOString(),
        endedAt: session.report.endedAt.toISOString(),
        createdAt: session.report.createdAt.toISOString(),
        cashSession: {
          ...session.report.cashSession,
          openingAmount: session.report.cashSession.openingAmount.toFixed(2),
          expectedCash: session.report.cashSession.expectedCash?.toFixed(2) ?? null,
          countedAmount: session.report.cashSession.countedAmount?.toFixed(2) ?? null,
          variance: session.report.cashSession.variance?.toFixed(2) ?? null,
        },
        expenses: session.report.expenses.map((expense) => ({
          ...expense,
          amount: expense.amount.toFixed(2),
          createdAt: expense.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

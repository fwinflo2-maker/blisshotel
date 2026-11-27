import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { scopeFor } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { hotelDateKey, parseDateOnly } from '@/server/reception';
import { serializeShiftReport, shiftReportInclude } from '@/server/shift-reports';

export const instant = false;

async function serverScope() {
  const scope = await scopeFor();
  if (scope.roleCode !== 'BAR_SERVER' && !scope.permissions.includes('cash_sessions.view_own')) throw new AppError(403, 'Accès réservé au personnel autorisé.');
  return scope;
}

function summary(session: {
  id: string; status: string; openingAmount: Prisma.Decimal; countedAmount: Prisma.Decimal | null;
  expectedCash: Prisma.Decimal | null; variance: Prisma.Decimal | null; openedAt: Date; closedAt: Date | null;
  shiftType: 'DAY' | 'NIGHT' | null; shiftStartedAt: Date | null; shiftEndedAt: Date | null;
  payments: { id: string; amount: Prisma.Decimal; description: string | null; reference: string | null; createdAt: Date; paymentMethod: { code: string; name: string }; restaurantOrder: { number: string } | null }[];
}) {
  const cashReceived = session.payments.filter((payment) => payment.paymentMethod.code === 'CASH').reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
  const expected = session.expectedCash ?? session.openingAmount.add(cashReceived);
  return {
    id: session.id, status: session.status, openingAmount: session.openingAmount.toFixed(2),
    cashReceived: cashReceived.toFixed(2), expectedCash: expected.toFixed(2),
    countedAmount: session.countedAmount?.toFixed(2) ?? null, variance: session.variance?.toFixed(2) ?? null,
    openedAt: session.openedAt.toISOString(), closedAt: session.closedAt?.toISOString() ?? null,
    shiftType: session.shiftType, shiftStartedAt: session.shiftStartedAt?.toISOString() ?? null, shiftEndedAt: session.shiftEndedAt?.toISOString() ?? null,
    transactions: session.payments.map((payment) => ({ id: payment.id, amount: payment.amount.toFixed(2), method: payment.paymentMethod.name, methodCode: payment.paymentMethod.code, description: payment.restaurantOrder?.number ? `Commande ${payment.restaurantOrder.number}` : payment.description, reference: payment.reference, createdAt: payment.createdAt.toISOString() })),
  };
}

const include = {
  payments: { orderBy: { createdAt: 'desc' as const }, include: { paymentMethod: { select: { code: true, name: true } }, restaurantOrder: { select: { number: true } } } },
  shiftReport: { include: shiftReportInclude },
};
const amountSchema = z.object({ amount: z.coerce.number().finite().min(0).max(100000000) });
const closeSchema = z.object({
  sessionId: z.string().min(1),
  countedAmount: z.coerce.number().finite().min(0).max(100000000),
  shiftType: z.enum(['DAY', 'NIGHT']),
});

export async function GET() {
  try {
    const scope = await serverScope();
    const [active, recent, hotel] = await Promise.all([
      db.cashSession.findFirst({ where: { userId: scope.userId, status: 'OPEN' }, include }),
      db.cashSession.findMany({ where: { userId: scope.userId }, orderBy: { openedAt: 'desc' }, take: 5, include }),
      hotelConfiguration(),
    ]);
    return NextResponse.json({
      session: active ? summary(active) : null,
      recent: recent.map((item) => ({ ...summary(item), report: item.shiftReport ? serializeShiftReport(item.shiftReport) : null })),
      hotel: { name: hotel.name, currency: hotel.currency, timezone: hotel.timezone },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const scope = await serverScope();
    const parsed = amountSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Indiquez le fond de caisse initial.' }, { status: 400 });
    const activeKey = scope.userId;
    const session = await db.$transaction(async (tx) => {
      if (await tx.cashSession.findUnique({ where: { activeKey }, select: { id: true } })) throw new AppError(409, 'Une caisse est déjà ouverte pour votre compte.');
      const created = await tx.cashSession.create({ data: { userId: scope.userId, activeKey, openingAmount: new Prisma.Decimal(parsed.data.amount) }, include });
      await tx.auditLog.create({ data: { actorId: scope.userId, action: 'RESTAURANT_CASH_OPEN', result: 'SUCCESS', targetId: created.id, details: { openingAmount: parsed.data.amount } } });
      return created;
    });
    return NextResponse.json({ session: summary(session) }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'Une session de caisse est déjà ouverte pour votre compte.' }, { status: 409 });
    throw error;
  }
}

export async function PATCH(request: Request) {
  try {
    const scope = await serverScope();
    const parsed = closeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Indiquez le type de service et le solde physique compté.' }, { status: 400 });
    const configuration = await hotelConfiguration();
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM CashSession WHERE id = ${parsed.data.sessionId} AND userId = ${scope.userId} FOR UPDATE`;
      const session = await tx.cashSession.findFirst({ where: { id: parsed.data.sessionId, userId: scope.userId, status: 'OPEN' }, include });
      if (!session) throw new AppError(404, 'Caisse ouverte introuvable.');
      const cashIn = session.payments.filter((payment) => payment.paymentMethod.code === 'CASH').reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      const expectedCash = session.openingAmount.add(cashIn);
      const countedAmount = new Prisma.Decimal(parsed.data.countedAmount);
      const variance = countedAmount.sub(expectedCash);
      const shiftStartedAt = session.openedAt;
      const shiftEndedAt = new Date();
      const closed = await tx.cashSession.update({
        where: { id: session.id },
        data: { status: 'CLOSED', activeKey: null, countedAmount, expectedCash, variance, closedAt: shiftEndedAt, shiftType: parsed.data.shiftType, shiftStartedAt, shiftEndedAt },
        include,
      });
      const shiftReservations = await tx.reservation.findMany({
        where: {
          restaurantOrders: { some: { createdBy: scope.userId, createdAt: { gte: shiftStartedAt, lte: shiftEndedAt } } },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          reference: true,
          totalAmount: true,
          room: { select: { number: true } },
          client: { select: { id: true, name: true, createdByName: true, creator: { select: { name: true } } } },
          folio: { select: { payments: { select: { amount: true } } } },
        },
      });
      const guestClients = new Map<string, { name: string; registeredBy: string; references: string[]; rooms: string[]; paid: boolean }>();
      for (const reservation of shiftReservations) {
        const paid = (reservation.folio?.payments ?? []).reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0)).gte(reservation.totalAmount);
        const existing = guestClients.get(reservation.client.id);
        if (existing) { existing.references.push(reservation.reference); existing.rooms.push(reservation.room?.number ?? 'Non attribuée'); existing.paid &&= paid; }
        else guestClients.set(reservation.client.id, {
          name: reservation.client.name,
          registeredBy: reservation.client.createdByName ?? reservation.client.creator?.name ?? 'Non renseigné',
          references: [reservation.reference],
          rooms: [reservation.room?.number ?? 'Non attribuée'],
          paid,
        });
      }
      const orderRows = await tx.restaurantOrder.findMany({
        where: { createdBy: scope.userId, createdAt: { gte: shiftStartedAt, lte: shiftEndedAt } },
        select: { id: true, totalAmount: true, status: true, lines: { select: { category: true, lineTotal: true } } },
      });
      const orderTotals = orderRows.reduce((total, order) => {
        if (order.status === 'REJECTED') return total;
        total.orders++;
        total.total = total.total.add(order.totalAmount);
        if (order.status === 'SERVED') total.served++;
        for (const line of order.lines) {
          if (line.category === 'FOOD') total.food = total.food.add(line.lineTotal);
          if (line.category === 'DRINK') total.drink = total.drink.add(line.lineTotal);
          if (line.category === 'BREAKFAST') total.breakfast = total.breakfast.add(line.lineTotal);
        }
        return total;
      }, { orders: 0, total: new Prisma.Decimal(0), food: new Prisma.Decimal(0), drink: new Prisma.Decimal(0), breakfast: new Prisma.Decimal(0), served: 0 });
      const invoicePayments = await tx.payment.findMany({
        where: { cashSessionId: session.id, createdAt: { gte: shiftStartedAt, lte: shiftEndedAt }, folio: { isNot: null } },
        select: {
          createdAt: true,
          folio: { select: {
            invoice: { select: { number: true, totalAmount: true, issuedAt: true } },
            payments: { select: { amount: true, cashSessionId: true } },
            reservation: { select: { reference: true, room: { select: { number: true } }, client: { select: { name: true, createdByName: true, creator: { select: { name: true } } } } } },
          } },
        },
      });
      const invoicesSettled = new Map<string, { invoiceNumber: string; clientName: string; registeredBy: string; reference: string; roomNumber: string | null; settledAt: Date }>();
      for (const payment of invoicePayments) {
        const folio = payment.folio;
        const invoice = folio?.invoice;
        if (!folio || !invoice || invoice.issuedAt >= shiftStartedAt) continue;
        const paidBefore = folio.payments.filter((item) => item.cashSessionId !== session.id).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        const paidAfter = folio.payments.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        if (paidBefore.gte(invoice.totalAmount) || !paidAfter.gte(invoice.totalAmount)) continue;
        const client = folio.reservation.client;
        const existing = invoicesSettled.get(invoice.number);
        if (!existing || payment.createdAt > existing.settledAt) invoicesSettled.set(invoice.number, {
          invoiceNumber: invoice.number, clientName: client.name,
          registeredBy: client.createdByName ?? client.creator?.name ?? 'Non renseigné',
          reference: folio.reservation.reference, roomNumber: folio.reservation.room?.number ?? null, settledAt: payment.createdAt,
        });
      }
      const paidByMethod = new Map<string, { name: string; amount: Prisma.Decimal }>();
      for (const payment of session.payments) {
        const current = paidByMethod.get(payment.paymentMethod.code) ?? { name: payment.paymentMethod.name, amount: new Prisma.Decimal(0) };
        current.amount = current.amount.add(payment.amount);
        paidByMethod.set(payment.paymentMethod.code, current);
      }
      const reportSummary = {
        department: 'BAR_RESTAURANT',
        operations: { reservationsCreated: shiftReservations.length, reservationsConfirmed: 0, reservationsCancelled: 0, checkIns: 0, checkOuts: 0 },
        reservations: {
          reservationsCount: shiftReservations.length,
          clientsCount: guestClients.size,
          paidClients: [...guestClients.values()].filter((client) => client.paid).length,
          unpaidClients: [...guestClients.values()].filter((client) => !client.paid).length,
          clients: [...guestClients.values()].map((client) => ({ name: client.name, registeredBy: client.registeredBy, references: client.references, rooms: [...new Set(client.rooms)], paymentStatus: client.paid ? 'PAYE' : 'NON_PAYE' })),
        },
        invoicesSettled: { count: invoicesSettled.size, clients: [...invoicesSettled.values()].map((item) => ({ ...item, settledAt: item.settledAt.toISOString() })) },
        payments: { count: session.payments.length, total: session.payments.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0)).toFixed(2), byMethod: [...paidByMethod].map(([code, item]) => ({ code, name: item.name, amount: item.amount.toFixed(2) })) },
        cash: { openingAmount: session.openingAmount.toFixed(2), cashReceived: cashIn.toFixed(2), cashExpenses: '0.00', totalExpenses: '0.00', expectedCash: expectedCash.toFixed(2), countedAmount: countedAmount.toFixed(2), variance: variance.toFixed(2) },
        restaurant: { ordersCount: orderTotals.orders, total: orderTotals.total.toFixed(2), foodTotal: orderTotals.food.toFixed(2), drinkTotal: orderTotals.drink.toFixed(2), breakfastTotal: orderTotals.breakfast.toFixed(2), servedCount: orderTotals.served },
        rooms: { status: [], housekeeping: [] },
        openFolios: { count: 0, balance: '0.00' },
      };
      const shiftReport = await tx.receptionShiftReport.create({
        data: {
          cashSessionId: session.id,
          userId: scope.userId,
          shiftType: parsed.data.shiftType,
          shiftDate: parseDateOnly(hotelDateKey(shiftStartedAt, configuration.timezone)),
          startedAt: shiftStartedAt,
          endedAt: shiftEndedAt,
          summary: reportSummary,
        },
        include: shiftReportInclude,
      });
      await tx.auditLog.create({
        data: { actorId: scope.userId, action: 'RESTAURANT_CASH_CLOSE', result: 'SUCCESS', targetId: session.id, details: { shiftType: parsed.data.shiftType, shiftStartedAt: shiftStartedAt.toISOString(), shiftEndedAt: shiftEndedAt.toISOString(), expectedCash: expectedCash.toFixed(2), countedAmount: countedAmount.toFixed(2), variance: variance.toFixed(2) } },
      });
      return { closed, shiftReport };
    });
    return NextResponse.json({
      session: summary(result.closed),
      report: serializeShiftReport(result.shiftReport),
      hotel: { name: configuration.name, currency: configuration.currency, timezone: configuration.timezone },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

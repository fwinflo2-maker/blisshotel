import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { platformApi } from '@/server/platform-admin';
import { hotelConfiguration } from '@/server/hotel';
import { parseDateOnly, parseHotelDateTime } from '@/server/reception';

export const instant = false;

const dateSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Per-staff audit trail and operational performance. Read-only; it grants no mutation rights. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return platformApi(async (actor) => {
    const { id } = await params;
    const url = new URL(request.url);
    const parsed = dateSchema.safeParse({ from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined });
    if (!parsed.success) return NextResponse.json({ error: 'Période invalide.' }, { status: 400 });
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, active: true, platformAdmin: true, createdAt: true, lastLoginAt: true, role: { select: { name: true, code: true } } },
    });
    if (!user || (!actor.platformAdmin && (user.platformAdmin || user.role?.code === 'OWNER'))) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });

    const configuration = await hotelConfiguration();
    const range: { gte?: Date; lt?: Date } = {};
    if (parsed.data.from) range.gte = parseHotelDateTime(`${parseDateOnly(parsed.data.from).toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    if (parsed.data.to) {
      const end = parseDateOnly(parsed.data.to);
      end.setUTCDate(end.getUTCDate() + 1);
      range.lt = parseHotelDateTime(`${end.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    }
    const createdAt = Object.keys(range).length ? { createdAt: range } : undefined;
    const openedAt = Object.keys(range).length ? { openedAt: range } : undefined;

    const [events, reservations, clients, paymentAggregate, cashSessions, eventCount] = await Promise.all([
      db.auditLog.findMany({
        where: { actorId: id, action: { startsWith: 'RECEPTION_' }, ...(createdAt ?? {}) },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true, action: true, result: true, targetId: true, details: true, createdAt: true },
      }),
      db.reservation.count({ where: { createdBy: id, ...(createdAt ?? {}) } }),
      db.client.count({ where: { createdBy: id, ...(createdAt ?? {}) } }),
      db.payment.aggregate({ where: { receivedBy: id, ...(createdAt ?? {}) }, _count: { id: true }, _sum: { amount: true } }),
      db.cashSession.findMany({
        where: { userId: id, ...(openedAt ?? {}) },
        orderBy: { openedAt: 'desc' },
        take: 50,
        select: { id: true, status: true, openingAmount: true, expectedCash: true, countedAmount: true, variance: true, openedAt: true, closedAt: true },
      }),
      db.auditLog.count({ where: { actorId: id, action: { startsWith: 'RECEPTION_' }, ...(createdAt ?? {}) } }),
    ]);

    return NextResponse.json({
      user,
      metrics: {
        reservationsCreated: reservations,
        clientsCreated: clients,
        paymentsCount: paymentAggregate._count.id,
        amountCollected: paymentAggregate._sum.amount?.toFixed(2) ?? '0.00',
        cashSessionsOpened: cashSessions.length,
        cashSessionsClosed: cashSessions.filter((session) => session.status === 'CLOSED').length,
        auditEvents: eventCount,
      },
      cashSessions: cashSessions.map((session) => ({
        ...session,
        openingAmount: session.openingAmount.toFixed(2),
        expectedCash: session.expectedCash?.toFixed(2) ?? null,
        countedAmount: session.countedAmount?.toFixed(2) ?? null,
        variance: session.variance?.toFixed(2) ?? null,
      })),
      events,
    });
  });
}

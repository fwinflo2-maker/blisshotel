import { db } from '@/server/db';
import { summarizeReceptionistPerformance, type PerformanceGranularity } from '@/features/reception-performance/domain';

export async function getReceptionistPerformance(
  from: Date,
  until: Date,
  granularity: PerformanceGranularity,
  timezone: string,
) {
  const receptionists = await db.user.findMany({
    where: { platformAdmin: false, role: { is: { code: 'RECEPTIONIST' } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  if (receptionists.length === 0) return { granularity, staff: [] };

  const receptionistIds = receptionists.map((person) => person.id);
  const [clients, sessions] = await Promise.all([
    db.client.findMany({
      where: { createdBy: { in: receptionistIds }, createdAt: { gte: from, lt: until } },
      select: { createdBy: true, createdAt: true },
    }),
    db.cashSession.findMany({
      where: { userId: { in: receptionistIds }, status: 'CLOSED', closedAt: { gte: from, lt: until } },
      orderBy: { closedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        closedAt: true,
        variance: true,
        shiftReport: { select: { shiftType: true } },
      },
    }),
  ]);
  const sessionIds = sessions.map((session) => session.id);
  const payments = sessionIds.length ? await db.payment.groupBy({
    by: ['cashSessionId'],
    where: { cashSessionId: { in: sessionIds } },
    _count: { id: true },
    _sum: { amount: true },
  }) : [];
  const paymentsBySession = new Map(payments.map((payment) => [payment.cashSessionId, {
    count: payment._count.id,
    amount: payment._sum.amount?.toFixed(2) ?? '0.00',
  }]));

  return summarizeReceptionistPerformance({
    receptionists,
    clients: clients.map((client) => ({ createdBy: client.createdBy, createdAt: client.createdAt.toISOString() })),
    closures: sessions.map((session) => {
      const payment = paymentsBySession.get(session.id);
      return {
        id: session.id,
        userId: session.userId,
        closedAt: session.closedAt!.toISOString(),
        shiftType: session.shiftReport?.shiftType ?? null,
        sales: payment?.amount ?? '0.00',
        paymentsCount: payment?.count ?? 0,
        variance: session.variance?.toFixed(2) ?? null,
      };
    }),
    granularity,
    timezone,
  });
}

import { NextResponse } from 'next/server';
import { platformApi } from '@/server/platform-admin';
import { db } from '@/server/db';

export async function GET() {
  return platformApi(async (actor) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [users, activeUsers, rooms, reservations, failedActions, recentFailureEvents, database] = await Promise.all([
      db.user.count({ where: actor.platformAdmin ? {} : { platformAdmin: false } }),
      db.user.count({ where: actor.platformAdmin ? { active: true } : { active: true, platformAdmin: false } }),
      db.room.count(),
      db.reservation.count(),
      db.auditLog.count({ where: { ...(actor.platformAdmin ? {} : { actorId: actor.id }), result: 'FAILURE', createdAt: { gte: since } } }),
      db.auditLog.findMany({
        where: { ...(actor.platformAdmin ? {} : { actorId: actor.id }), result: 'FAILURE', createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, action: true, createdAt: true },
      }),
      db.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
    ]);

    return NextResponse.json({
      counts: { users, activeUsers, rooms, reservations },
      ...(!actor.platformAdmin ? {} : {
        services: {
          database: database[0]?.ok === 1 ? 'available' : 'unavailable',
          email: 'not_implemented',
          recentFailures: failedActions,
          recentFailureEvents,
        },
        version: process.env.npm_package_version ?? '0.1.0',
        environment: process.env.NODE_ENV ?? 'unknown',
      }),
    });
  });
}

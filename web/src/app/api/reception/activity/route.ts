import { NextResponse } from 'next/server';
import { authorizedScope } from '@/server/auth';
import { AppError, assertPermission } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { parseDateOnly, parseHotelDateTime } from '@/server/reception';

export const instant = false;

/**
 * Centralized activity history. Receptionists always see their own operations;
 * visibility of colleagues' operations never grants modification rights.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = await authorizedScope('dashboard.view');
    const view = url.searchParams.get('scope') === 'all' ? 'all' : 'mine';
    if (scope.roleCode === 'HOTEL_ADMIN' && view === 'all') return NextResponse.json({ error: 'L’historique partagé n’est pas disponible dans l’espace Administrateur Hôtel.' }, { status: 403 });
    if (view === 'all') assertPermission(scope, 'reservations.view');
    const targetId = url.searchParams.get('targetId')?.trim() ?? '';
    const period = url.searchParams.get('period') ?? 'all';
    const fromText = url.searchParams.get('from');
    const toText = url.searchParams.get('to');
    const configuration = await hotelConfiguration();

    let createdAt: { gte?: Date; lte?: Date } = {};
    if (fromText || toText) {
      if (fromText) createdAt.gte = parseHotelDateTime(`${parseDateOnly(fromText).toISOString().slice(0, 10)}T00:00`, configuration.timezone);
      if (toText) {
        const to = parseDateOnly(toText);
        to.setUTCDate(to.getUTCDate() + 1);
        createdAt.lte = parseHotelDateTime(`${to.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
      }
    } else if (['day', 'week', 'month', 'year', '99years'].includes(period)) {
      const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: configuration.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const start = parseDateOnly(todayKey);
      if (period === 'week') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      if (period === 'month') start.setUTCDate(1);
      if (period === 'year') start.setUTCMonth(0, 1);
      if (period === '99years') start.setUTCFullYear(start.getUTCFullYear() - 99);
      createdAt = { gte: parseHotelDateTime(`${start.toISOString().slice(0, 10)}T00:00`, configuration.timezone) };
    }

    const events = await db.auditLog.findMany({
      where: {
        action: { startsWith: 'RECEPTION_' },
        ...(scope.roleCode === 'HOTEL_ADMIN' || (view === 'mine' && !targetId) ? { actorId: scope.userId } : {}),
        ...(targetId ? { targetId } : {}),
        ...(createdAt.gte || createdAt.lte ? { createdAt } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, actorId: true, action: true, result: true, targetId: true, details: true, createdAt: true },
    });

    const actorIds = [...new Set(events.map((event) => event.actorId).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length
      ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));

    return NextResponse.json({
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        result: event.result,
        targetId: event.targetId,
        details: event.details,
        createdAt: event.createdAt,
        mine: event.actorId === scope.userId,
        actor: event.actorId ? actorNames.get(event.actorId) ?? 'Compte indisponible' : 'Système',
      })),
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

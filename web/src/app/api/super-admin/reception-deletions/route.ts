import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { hotelManagementApi } from '@/server/platform-admin';

export const instant = false;

function previousStatus(details: unknown) {
  if (!details || typeof details !== 'object' || Array.isArray(details) || !('before' in details)) return null;
  return typeof details.before === 'string' ? details.before : null;
}

export async function GET(request: Request) {
  return hotelManagementApi(async (actor) => {
    const url = new URL(request.url);
    const rawPage = Number(url.searchParams.get('page') ?? 1);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10000) : 1;
    const receptionists = await db.user.findMany({
      where: { role: { is: { code: 'RECEPTIONIST' } } },
      select: { id: true, name: true },
    });
    const receptionistById = new Map(receptionists.map((user) => [user.id, user]));
    const where = {
      action: 'RECEPTION_RESERVATION_CANCEL',
      result: 'SUCCESS',
      actorId: { in: receptionists.map((user) => user.id) },
    };
    const [events, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
        select: { id: true, actorId: true, targetId: true, details: true, createdAt: true },
      }),
      db.auditLog.count({ where }),
    ]);
    const reservationIds = events.flatMap((event) => event.targetId ? [event.targetId] : []);
    const reservations = reservationIds.length ? await db.reservation.findMany({
      where: { id: { in: reservationIds } },
      select: {
        id: true,
        reference: true,
        client: { select: { name: true } },
        room: { select: { number: true } },
      },
    }) : [];
    const reservationById = new Map(reservations.map((reservation) => [reservation.id, reservation]));

    return NextResponse.json({
      events: events.map((event) => ({
        id: event.id,
        createdAt: event.createdAt.toISOString(),
        receptionist: event.actorId ? receptionistById.get(event.actorId)?.name ?? 'Compte inconnu' : 'Compte inconnu',
        previousStatus: previousStatus(event.details),
        reservation: event.targetId ? reservationById.get(event.targetId) ?? null : null,
      })),
      total,
      page,
      pageSize: 50,
    });
  });
}

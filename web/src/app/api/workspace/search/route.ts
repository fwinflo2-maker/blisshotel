import { NextResponse } from 'next/server';
import { requireSession, scopeFor } from '@/server/auth';
import { AppError, roomAssignmentFilter } from '@/server/policy';
import { db } from '@/server/db';

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const platformAdmin = session.user.platformAdmin;
    const scope = platformAdmin ? null : await scopeFor();
    const permissions = new Set(scope?.permissions ?? []);
    const can = (permission: string) => platformAdmin || permissions.has(permission);
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (query.length < 2) return NextResponse.json({ rooms: [], reservations: [], clients: [] });
    const roleCode = platformAdmin ? 'SUPER_ADMIN' : scope!.roleCode;
    const assignedRoomFilter = roleCode === 'HOTEL_ADMIN' ? roomAssignmentFilter(roleCode, session.user.id) : {};
    const [rooms, reservations, clients] = await Promise.all([
      can('rooms.view') ? db.room.findMany({
        where: { ...assignedRoomFilter, active: true, OR: [{ number: { contains: query } }, { floor: { contains: query } }] },
        take: 8, orderBy: { number: 'asc' },
        select: { id: true, number: true, floor: true, status: true, housekeepingStatus: true, technicalStatus: true, reservations: { where: { stay: { is: { checkedOutAt: null } } }, take: 1, select: { client: { select: { name: true } } } } },
      }) : Promise.resolve([]),
      can('reservations.view') || can('stays.view') ? db.reservation.findMany({
        where: {
          ...(roleCode === 'HOTEL_ADMIN' ? { room: { is: { assignedHotelAdminId: session.user.id } } } : {}),
          OR: [
            { reference: { contains: query } },
            ...(can('clients.view') ? [{ client: { is: { name: { contains: query } } } }] : []),
          ],
          status: { not: 'CANCELLED' },
        },
        take: 10, orderBy: { createdAt: 'desc' },
        select: { id: true, reference: true, status: true, checkInDate: true, client: { select: { name: true } }, room: { select: { number: true } } },
      }) : Promise.resolve([]),
      can('clients.view') ? db.client.findMany({
        where: {
          ...(roleCode === 'HOTEL_ADMIN' ? { reservations: { some: { room: { is: { assignedHotelAdminId: session.user.id } } } } } : {}),
          OR: [{ name: { contains: query } }, { email: { contains: query } }, { phone: { contains: query } }],
        },
        take: 8, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, phone: true },
      }) : Promise.resolve([]),
    ]);
    return NextResponse.json({
      rooms: rooms.map((room) => ({ id: room.id, number: room.number, floor: room.floor, status: room.reservations.length ? 'OCCUPIED' : room.status === 'OCCUPIED' ? (room.housekeepingStatus === 'CLEAN' && room.technicalStatus === 'OPERATIONAL' ? 'AVAILABLE' : 'DIRTY') : room.status, housekeepingStatus: room.housekeepingStatus, currentGuest: room.reservations[0]?.client.name ?? null })),
      reservations: reservations.map((reservation) => ({ id: reservation.id, reference: reservation.reference, status: reservation.status, checkInDate: reservation.checkInDate.toISOString().slice(0, 10), client: can('clients.view') || (roleCode === 'HOTEL_ADMIN' && reservation.status === 'CHECKED_IN') ? reservation.client.name : null, room: reservation.room?.number ?? null })),
      clients: clients.map((client) => ({ id: client.id, name: client.name, email: client.email, phone: client.phone })),
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { hotelAdminScope } from '@/server/hotel-admin';
import { hotelDateKey, parseDateOnly, parseHotelDateTime } from '@/server/reception';
import { AppError } from '@/server/policy';

export const instant = false;

const addDays = (value: Date, days: number) => { const result = new Date(value); result.setUTCDate(result.getUTCDate() + days); return result; };

export async function GET(request: Request) {
  try {
    const scope = await hotelAdminScope('dashboard.view');
    const configuration = await hotelConfiguration();
    const url = new URL(request.url);
    const period = z.enum(['day', 'week', 'month', 'year']).safeParse(url.searchParams.get('period') ?? 'day');
    const dateValue = url.searchParams.get('date') ?? hotelDateKey(new Date(), configuration.timezone);
    if (!period.success) return NextResponse.json({ error: 'Période invalide.' }, { status: 400 });
    const selected = parseDateOnly(dateValue);
    const oldestSelectable = new Date();
    oldestSelectable.setUTCFullYear(oldestSelectable.getUTCFullYear() - 99);
    if (selected < oldestSelectable) return NextResponse.json({ error: 'La consultation est limitée aux 99 dernières années.' }, { status: 400 });
    let from = selected;
    let to = addDays(selected, 1);
    if (period.data === 'week') to = addDays(selected, 7);
    if (period.data === 'month') {
      from = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1));
      to = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth() + 1, 1));
    }
    if (period.data === 'year') {
      from = new Date(Date.UTC(selected.getUTCFullYear(), 0, 1));
      to = new Date(Date.UTC(selected.getUTCFullYear() + 1, 0, 1));
    }
    const [rooms, arrivals, departures, futureReservations, inHouse, taskGroups, incidents, upcoming, payments] = await Promise.all([
      db.room.findMany({
        where: { assignedHotelAdminId: scope.userId, active: true },
        select: { id: true, status: true, housekeepingStatus: true, technicalStatus: true },
      }),
      db.reservation.count({ where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } }, status: { in: ['PENDING', 'CONFIRMED'] }, checkInDate: { gte: from, lt: to } } }),
      db.reservation.count({ where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } }, stay: { is: { checkedOutAt: null } }, checkOutDate: { gte: from, lt: to } } }),
      db.reservation.count({ where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } }, status: { in: ['PENDING', 'CONFIRMED'] }, checkInDate: { gte: parseDateOnly(hotelDateKey(new Date(), configuration.timezone)) } } }),
      db.reservation.count({ where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } }, stay: { is: { checkedOutAt: null } } } }),
      db.housekeepingTask.groupBy({ by: ['status'], where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } } }, _count: { _all: true } }),
      db.roomIncident.count({ where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } }, status: { not: 'RESOLVED' } } }),
      scope.permissions.includes('reservations.view') || scope.permissions.includes('stays.view')
        ? db.reservation.findMany({
          where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } }, status: scope.permissions.includes('reservations.view') ? { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] } : 'CHECKED_IN', checkOutDate: { gte: from }, checkInDate: { lt: to } },
          orderBy: [{ checkInDate: 'asc' }, { createdAt: 'desc' }], take: 8,
          select: { id: true, reference: true, status: true, checkInDate: true, checkOutDate: true, client: { select: { name: true } }, room: { select: { number: true } } },
        }) : Promise.resolve([]),
      scope.permissions.includes('reports.financial.view')
        ? db.payment.aggregate({
          where: { createdAt: { gte: parseHotelDateTime(`${from.toISOString().slice(0, 10)}T00:00`, configuration.timezone), lt: parseHotelDateTime(`${to.toISOString().slice(0, 10)}T00:00`, configuration.timezone) }, folio: { is: { reservation: { is: { room: { is: { assignedHotelAdminId: scope.userId, active: true } } } } } } },
          _sum: { amount: true },
        }) : Promise.resolve(null),
    ]);
    const statusCount = (status: string) => taskGroups.find((group) => group.status === status)?._count._all ?? 0;
    const roomIdsReserved = new Set((await db.reservation.findMany({
      where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } }, status: { in: ['PENDING', 'CONFIRMED'] }, checkInDate: { lt: to }, checkOutDate: { gt: from } },
      select: { roomId: true }, distinct: ['roomId'],
    })).map((item) => item.roomId).filter((id): id is string => id !== null));
    const occupiedRoomIds = new Set((await db.stay.findMany({
      where: { roomId: { in: rooms.map((room) => room.id) }, checkedOutAt: null },
      select: { roomId: true },
    })).map((stay) => stay.roomId));
    const effectiveRoomStatus = (room: typeof rooms[number]) => occupiedRoomIds.has(room.id)
      ? 'OCCUPIED'
      : room.status === 'OCCUPIED'
        ? (room.housekeepingStatus === 'CLEAN' && room.technicalStatus === 'OPERATIONAL' ? 'AVAILABLE' : 'DIRTY')
        : room.status;
    const financial = payments?._sum.amount?.toFixed(2) ?? null;
    return NextResponse.json({
      period: period.data,
      currency: configuration.currency,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      counts: {
        rooms: rooms.length,
        available: rooms.filter((room) => effectiveRoomStatus(room) === 'AVAILABLE' && !roomIdsReserved.has(room.id)).length,
        reserved: roomIdsReserved.size,
        occupied: occupiedRoomIds.size,
        toClean: rooms.filter((room) => room.housekeepingStatus === 'TO_CLEAN').length,
        inProgress: statusCount('IN_PROGRESS'),
        toInspect: rooms.filter((room) => room.housekeepingStatus === 'TO_INSPECT').length,
        inspected: statusCount('COMPLETED'),
        maintenance: rooms.filter((room) => room.technicalStatus !== 'OPERATIONAL' || room.status === 'OUT_OF_SERVICE').length,
        arrivals,
        departures,
        futureReservations,
        inHouse,
        incidents,
      },
      financial: scope.permissions.includes('reports.financial.view') ? { collected: financial } : null,
      upcoming: (upcoming as { id: string; reference: string; status: string; checkInDate: Date; checkOutDate: Date; client: { name: string }; room: { number: string } | null }[]).map((item) => ({
        id: item.id, reference: item.reference, status: item.status,
        checkInDate: item.checkInDate.toISOString().slice(0, 10), checkOutDate: item.checkOutDate.toISOString().slice(0, 10),
        roomNumber: item.room?.number ?? '—', client: scope.permissions.includes('clients.view') ? item.client.name : null,
      })),
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

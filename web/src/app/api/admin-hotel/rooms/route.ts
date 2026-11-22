import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { adminRoomWhere, hotelAdminScope } from '@/server/hotel-admin';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

export async function GET() {
  try {
    const scope = await hotelAdminScope('rooms.view');
    const showRates = scope.permissions.includes('rooms.rates.view');
    const showReservations = scope.permissions.includes('reservations.view') || scope.permissions.includes('stays.view');
    const rooms = await db.room.findMany({
      where: adminRoomWhere(scope), orderBy: [{ floor: 'asc' }, { number: 'asc' }],
      include: {
        category: { select: { name: true, capacity: true } },
        housekeepingTasks: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, status: true, createdAt: true, updatedAt: true, inspectionNote: true } },
        incidents: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, title: true, description: true, status: true, createdAt: true, updatedAt: true, reportedBy: true } },
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, dimension: true, previousStatus: true, nextStatus: true, reason: true, source: true, actorId: true, createdAt: true } },
        reservations: { orderBy: { checkInDate: 'desc' }, take: 20, select: { id: true, reference: true, status: true, checkInDate: true, checkOutDate: true, stayType: true, client: { select: { name: true } } } },
      },
    });
    const currentStays = rooms.length ? await db.reservation.findMany({
      where: { roomId: { in: rooms.map((room) => room.id) }, stay: { is: { checkedOutAt: null } } },
      select: { roomId: true, client: { select: { name: true } }, stay: { select: { expectedCheckOutAt: true } } },
    }) : [];
    const guestByRoom = new Map(currentStays.flatMap((stay) => stay.roomId ? [[stay.roomId, { name: stay.client.name, expectedCheckOutAt: stay.stay?.expectedCheckOutAt?.toISOString() ?? null }] as const] : []));
    return NextResponse.json({ rooms: rooms.map((room) => ({
      id: room.id, number: room.number, floor: room.floor, capacity: room.capacity, bedType: room.bedType,
      area: room.area?.toFixed(2) ?? null, description: room.description, observations: room.observations,
      equipment: room.equipment, photos: room.photos, status: guestByRoom.has(room.id) ? 'OCCUPIED' : room.status === 'OCCUPIED' ? (room.housekeepingStatus === 'CLEAN' && room.technicalStatus === 'OPERATIONAL' ? 'AVAILABLE' : 'DIRTY') : room.status, housekeepingStatus: room.housekeepingStatus,
      technicalStatus: room.technicalStatus, category: room.category.name, categoryCapacity: room.category.capacity,
      currentGuest: guestByRoom.get(room.id) ?? null,
      nightlyRateMin: showRates ? room.nightlyRateMin?.toFixed(2) ?? null : null,
      nightlyRateMax: showRates ? room.nightlyRateMax?.toFixed(2) ?? null : null,
      reservations: showReservations ? room.reservations.filter((reservation) => scope.permissions.includes('reservations.view') || reservation.status === 'CHECKED_IN').map((reservation) => ({
        id: reservation.id, reference: reservation.reference, status: reservation.status, stayType: reservation.stayType,
        checkInDate: reservation.checkInDate.toISOString().slice(0, 10), checkOutDate: reservation.checkOutDate.toISOString().slice(0, 10),
        client: scope.permissions.includes('clients.view') ? reservation.client.name : null,
      })) : [],
      housekeepingTasks: room.housekeepingTasks,
      incidents: room.incidents,
      history: room.statusHistory,
    })) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

const editSchema = z.object({
  id: z.string().min(1),
  floor: z.string().trim().max(30).nullable().optional(),
  capacity: z.number().int().min(1).max(100).nullable().optional(),
  bedType: z.string().trim().max(100).nullable().optional(),
  area: z.number().positive().max(10000).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  observations: z.string().trim().max(2000).nullable().optional(),
  equipment: z.array(z.string().trim().min(1).max(100)).max(50).nullable().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== 'id'), 'Aucune modification fournie.');

export async function PATCH(request: Request) {
  try {
    const scope = await hotelAdminScope('rooms.manage');
    const parsed = editSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Informations de chambre invalides.' }, { status: 400 });
    const { id, ...input } = parsed.data;
    const room = await db.room.findFirst({ where: { id, ...adminRoomWhere(scope) }, select: { id: true, number: true } });
    if (!room) throw new AppError(404, 'Chambre introuvable dans votre périmètre.');
    const data: Prisma.RoomUpdateInput = {
      ...(input.floor !== undefined ? { floor: input.floor } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.bedType !== undefined ? { bedType: input.bedType } : {}),
      ...(input.area !== undefined ? { area: input.area === null ? null : new Prisma.Decimal(input.area) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.observations !== undefined ? { observations: input.observations } : {}),
      ...(input.equipment !== undefined ? { equipment: input.equipment as Prisma.InputJsonValue } : {}),
    };
    await db.$transaction(async (tx) => {
      await tx.room.update({ where: { id }, data });
      await tx.auditLog.create({ data: { actorId: scope.userId, action: 'HOTEL_ADMIN_ROOM_DETAILS_UPDATE', result: 'SUCCESS', targetId: id, details: { roomNumber: room.number, fields: Object.keys(input) } } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

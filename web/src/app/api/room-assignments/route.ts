import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { hotelManagementApi } from '@/server/platform-admin';
import { assertRoomAssignmentManager } from '@/server/policy';

export const instant = false;

export async function GET() {
  return hotelManagementApi(async (actor) => {
    assertRoomAssignmentManager(actor);
    const [rooms, admins] = await Promise.all([
      db.room.findMany({
        orderBy: [{ floor: 'asc' }, { number: 'asc' }],
        select: { id: true, number: true, floor: true, status: true, assignedHotelAdminId: true, assignedHotelAdmin: { select: { id: true, name: true, email: true } } },
      }),
      db.user.findMany({ where: { active: true, role: { code: 'HOTEL_ADMIN' } }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
    ]);
    return NextResponse.json({ hotel: 'BLISS HOTEL', rooms, administrators: admins });
  });
}

const schema = z.object({ assignments: z.array(z.object({ roomId: z.string().min(1), administratorId: z.string().min(1).nullable() })).max(2000) });

export async function PUT(request: Request) {
  return hotelManagementApi(async (actor) => {
    assertRoomAssignmentManager(actor);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Affectations invalides.' }, { status: 400 });
    const assignments = parsed.data.assignments;
    if (new Set(assignments.map((item) => item.roomId)).size !== assignments.length) return NextResponse.json({ error: 'Une chambre ne peut apparaître qu’une fois.' }, { status: 400 });

    const result = await db.$transaction(async (tx) => {
      const rooms = await tx.room.findMany({ select: { id: true, number: true, assignedHotelAdminId: true } });
      const roomById = new Map(rooms.map((room) => [room.id, room]));
      const admins = await tx.user.findMany({ where: { id: { in: [...new Set(assignments.flatMap((item) => item.administratorId ? [item.administratorId] : []))] }, active: true, role: { code: 'HOTEL_ADMIN' } }, select: { id: true, name: true } });
      const adminIds = new Set(admins.map((admin) => admin.id));
      for (const item of assignments) {
        if (!roomById.has(item.roomId)) return { error: 'Une chambre sélectionnée n’existe plus.', status: 404 };
        if (item.administratorId && !adminIds.has(item.administratorId)) return { error: 'Un administrateur sélectionné est introuvable ou inactif.', status: 400 };
      }
      const changes = assignments.filter((item) => roomById.get(item.roomId)?.assignedHotelAdminId !== item.administratorId);
      for (const item of changes) {
        const previousAdministratorId = roomById.get(item.roomId)?.assignedHotelAdminId ?? null;
        const roomNumber = roomById.get(item.roomId)?.number;
        await tx.room.update({ where: { id: item.roomId }, data: { assignedHotelAdminId: item.administratorId } });
        await tx.auditLog.create({ data: { actorId: actor.id, action: 'ROOM_ADMIN_REASSIGNED', result: 'SUCCESS', targetId: item.roomId, details: { roomNumber, fromAdministratorId: previousAdministratorId, toAdministratorId: item.administratorId } } });
        const notices = [
          ...(previousAdministratorId ? [{ userId: previousAdministratorId, message: `La chambre ${roomNumber} ne vous est plus attribuée.` }] : []),
          ...(item.administratorId ? [{ userId: item.administratorId, message: `La chambre ${roomNumber} vous a été attribuée dans BLISS HOTEL.` }] : []),
        ];
        if (notices.length) await tx.notification.createMany({ data: notices.map((notice) => ({ ...notice, message: notice.message.slice(0, 500) })) });
      }
      return { updated: changes.length };
    });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  });
}

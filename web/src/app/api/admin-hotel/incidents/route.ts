import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { hotelAdminScope } from '@/server/hotel-admin';
import { AppError } from '@/server/policy';

const schema = z.object({ roomId: z.string().min(1), title: z.string().trim().min(3).max(160), description: z.string().trim().max(1000).optional() });

export async function POST(request: Request) {
  try {
    const scope = await hotelAdminScope('maintenance.incidents.report');
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Indiquez une chambre et décrivez le problème en 3 caractères minimum.' }, { status: 400 });
    const room = await db.room.findFirst({ where: { id: parsed.data.roomId, assignedHotelAdminId: scope.userId, active: true }, select: { id: true, number: true } });
    if (!room) throw new AppError(404, 'Chambre introuvable dans votre périmètre.');
    const incident = await db.$transaction(async (tx) => {
      const created = await tx.roomIncident.create({ data: { roomId: room.id, title: parsed.data.title, description: parsed.data.description ?? null, reportedBy: scope.userId } });
      await tx.auditLog.create({ data: { actorId: scope.userId, action: 'HOTEL_ADMIN_INCIDENT_REPORTED', result: 'SUCCESS', targetId: created.id, details: { roomId: room.id, roomNumber: room.number, title: created.title } } });
      return created;
    });
    return NextResponse.json({ incident }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

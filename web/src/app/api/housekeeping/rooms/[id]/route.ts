import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope, requireSession, roomAssignmentWhere } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const incidentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scope = await authorizedScope('rooms.view');
    const room = await db.room.findFirst({
      where: { id, ...roomAssignmentWhere(scope) },
      include: {
        category: { select: { id: true, name: true, capacity: true } },
        reservations: {
          orderBy: { checkInDate: 'desc' },
          take: 20,
          select: {
            id: true,
            reference: true,
            status: true,
            checkInDate: true,
            checkOutDate: true,
          },
        },
        housekeepingTasks: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: {
            assignee: { select: { id: true, name: true } },
            assignments: { include: { agent: { select: { id: true, name: true } } } },
            inspector: { select: { id: true, name: true } },
          },
        },
        incidents: { orderBy: { createdAt: 'desc' }, take: 30 },
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!room) throw new AppError(404, 'Chambre introuvable.');
    if (scope.roleCode !== 'HOTEL_ADMIN') return NextResponse.json({ room });
    const canViewReservations = scope.permissions.includes('reservations.view');
    const canViewStays = scope.permissions.includes('stays.view');
    return NextResponse.json({ room: {
      id: room.id, number: room.number, floor: room.floor, capacity: room.capacity, bedType: room.bedType, area: room.area,
      description: room.description, observations: room.observations, equipment: room.equipment, photos: room.photos,
      active: room.active, technicalStatus: room.technicalStatus, status: room.status, housekeepingStatus: room.housekeepingStatus,
      category: room.category,
      ...(scope.permissions.includes('rooms.rates.view') ? { nightlyRateMin: room.nightlyRateMin, nightlyRateMax: room.nightlyRateMax } : {}),
      reservations: canViewReservations || canViewStays ? room.reservations.filter((reservation) => canViewReservations || reservation.status === 'CHECKED_IN').map(({ id: reservationId, reference, status, checkInDate, checkOutDate }) => ({ id: reservationId, reference, status, checkInDate, checkOutDate })) : [],
      housekeepingTasks: scope.permissions.includes('housekeeping.tasks.view') ? room.housekeepingTasks : [],
      incidents: scope.permissions.includes('maintenance.view') ? room.incidents : [],
      statusHistory: scope.permissions.includes('maintenance.view') ? room.statusHistory : [],
    } });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const roleCode = session.user.role?.code;
    if (roleCode !== 'GOUVERNANTE' && roleCode !== 'HOUSEKEEPER') {
      throw new AppError(403, 'Cet espace est réservé à la Gouvernante et aux Agents d’entretien.');
    }
    await authorizedScope(roleCode === 'GOUVERNANTE' ? 'housekeeping.tasks.assign' : 'housekeeping.tasks.execute');
    const { id } = await params;
    const parsed = incidentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Le titre de l’incident est obligatoire.' }, { status: 400 });
    const room = await db.room.findUnique({ where: { id }, select: { id: true } });
    if (!room) throw new AppError(404, 'Chambre introuvable.');
    const incident = await db.$transaction(async (tx) => {
      const before = await tx.room.findUnique({ where: { id: room.id }, select: { technicalStatus: true } });
      const created = await tx.roomIncident.create({
        data: {
          roomId: room.id,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          reportedBy: session.user.id,
        },
      });
      await tx.room.update({
        where: { id: room.id },
        data: { technicalStatus: 'INTERVENTION_REQUIRED' },
      });
      await tx.roomStatusHistory.create({
        data: {
          roomId: room.id,
          dimension: 'TECHNICAL',
          previousStatus: before?.technicalStatus ?? null,
          nextStatus: 'INTERVENTION_REQUIRED',
          reason: parsed.data.title,
          source: 'HOUSEKEEPING_INCIDENT',
          actorId: session.user.id,
        },
      });
      return created;
    });
    await db.auditLog.create({
      data: {
        actorId: session.user.id,
        action: 'ROOM_INCIDENT_REPORT',
        result: 'SUCCESS',
        targetId: incident.id,
        details: { roomId: room.id, title: incident.title },
      },
    });
    return NextResponse.json({ incident }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

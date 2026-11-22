import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { hotelAdminScope } from '@/server/hotel-admin';
import { AppError } from '@/server/policy';

export async function GET() {
  try {
    const scope = await hotelAdminScope('housekeeping.tasks.view');
    const tasks = await db.housekeepingTask.findMany({
      where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], take: 200,
      include: { room: { select: { id: true, number: true } }, assignee: { select: { name: true } }, assignments: { include: { agent: { select: { name: true } } } }, inspector: { select: { name: true } } },
    });
    return NextResponse.json({ tasks: tasks.map(({ room, assignee, assignments, inspector, ...task }) => ({
      ...task, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(), dueAt: task.dueAt?.toISOString() ?? null,
      startedAt: task.startedAt?.toISOString() ?? null, readyForInspectionAt: task.readyForInspectionAt?.toISOString() ?? null, inspectedAt: task.inspectedAt?.toISOString() ?? null,
      room, assignee: assignee?.name ?? null, agents: assignments.map((item) => item.agent.name), inspector: inspector?.name ?? null,
    })) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope, requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { housekeepingTransition } from '@/features/housekeeping/domain';

export const instant = false;

const housekeepingRoles = ['HOUSEKEEPER', 'GOUVERNANTE'];
const workerRoles = ['HOUSEKEEPER'];

async function housekeepingActor() {
  const session = await requireSession();
  const roleCode = session.user.role?.code;
  const isManager = roleCode === 'GOUVERNANTE';
  if (!housekeepingRoles.includes(roleCode ?? '')) {
    throw new AppError(403, 'Cet espace est réservé à l’équipe d’entretien.');
  }
  const scope = await authorizedScope(isManager ? 'housekeeping.tasks.assign' : 'housekeeping.tasks.execute');
  return { scope, isManager };
}

function isDuplicateActiveRoom(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function GET() {
  try {
    const { scope, isManager } = await housekeepingActor();
    const tasks = await db.housekeepingTask.findMany({
      where: isManager ? {} : { OR: [{ assignedTo: scope.userId }, { assignments: { some: { agentId: scope.userId } } }] },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        room: { select: { number: true, floor: true } },
        assignee: { select: { id: true, name: true, role: { select: { name: true } } } },
        assignments: { include: { agent: { select: { id: true, name: true, role: { select: { name: true } } } } } },
        inspector: { select: { name: true } },
      },
    });
    const [agents, rooms] = isManager ? await Promise.all([
      db.user.findMany({
        where: { active: true, role: { is: { code: { in: workerRoles } } } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, role: { select: { name: true } } },
      }),
      db.room.findMany({
        where: { active: true },
        orderBy: [{ floor: 'asc' }, { number: 'asc' }],
        select: {
          id: true,
          number: true,
          floor: true,
          status: true,
          housekeepingStatus: true,
          technicalStatus: true,
          active: true,
          capacity: true,
          bedType: true,
          area: true,
          description: true,
          observations: true,
          equipment: true,
          photos: true,
          category: { select: { name: true, capacity: true } },
          incidents: {
            where: { status: { not: 'RESOLVED' } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          housekeepingTasks: {
            where: { status: { not: 'COMPLETED' } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { assignee: { select: { id: true, name: true } }, assignments: { include: { agent: { select: { id: true, name: true } } } } },
          },
        },
      }),
    ]) : [[], []];

    return NextResponse.json({
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        taskType: task.taskType,
        notes: task.notes,
        status: task.status,
        createdAt: task.createdAt.toISOString(),
        startedAt: task.startedAt?.toISOString() ?? null,
        readyForInspectionAt: task.readyForInspectionAt?.toISOString() ?? null,
        inspectedAt: task.inspectedAt?.toISOString() ?? null,
        inspectionNote: task.inspectionNote,
        room: task.room,
        assignee: task.assignee,
        assignees: [...new Map([...(task.assignee ? [task.assignee] : []), ...task.assignments.map((assignment) => assignment.agent)].map((agent) => [agent.id, agent])).values()],
        inspector: task.inspector,
      })),
      agents,
      rooms,
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

const taskTitles = {
  CLEANING: 'Nettoyer la chambre',
  BED_MAKING: 'Dresser le lit',
  ROOM_ARRANGEMENT: 'Arranger la chambre',
} as const;

const createSchema = z.object({
  notes: z.string().trim().max(500).optional(),
  roomId: z.string().min(1),
  assignedTo: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  taskType: z.enum(['CLEANING', 'BED_MAKING', 'ROOM_ARRANGEMENT']).default('CLEANING'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  dueAt: z.string().datetime().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const { scope, isManager } = await housekeepingActor();
    if (!isManager) throw new AppError(403, 'Seule la Gouvernante peut affecter une tâche.');
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'La tâche, la chambre et l’Agent d’entretien sont obligatoires.' }, { status: 400 });
    const { notes, roomId, taskType, priority, dueAt } = parsed.data;
    const assignedTo = [...new Set(Array.isArray(parsed.data.assignedTo) ? parsed.data.assignedTo : [parsed.data.assignedTo])];

    const result = await db.$transaction(async (tx) => {
      const lockedRoom = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE
      `;
      if (!lockedRoom.length) throw new AppError(404, 'Chambre introuvable.');
      const [room, agents, activeTask] = await Promise.all([
        tx.room.findUnique({ where: { id: roomId }, select: { id: true, status: true, housekeepingStatus: true, active: true, technicalStatus: true } }),
        tx.user.findMany({
          where: { id: { in: assignedTo }, active: true, role: { is: { code: { in: workerRoles } } } },
          select: { id: true },
        }),
        tx.housekeepingTask.findFirst({
          where: { roomId, status: { not: 'COMPLETED' } },
          select: { id: true, assignedTo: true, status: true, assignments: { select: { id: true } } },
        }),
      ]);
      if (!room) throw new AppError(404, 'Chambre introuvable.');
      if (!room.active) throw new AppError(409, 'Cette chambre est désactivée.');
      if (room.status === 'OUT_OF_SERVICE' || room.housekeepingStatus === 'OUT_OF_SERVICE') {
        throw new AppError(409, 'Une chambre hors service ne peut pas recevoir de tâche d’entretien.');
      }
      if (room.technicalStatus !== 'OPERATIONAL') {
        throw new AppError(409, 'Une chambre en intervention ou en maintenance ne peut pas recevoir de tâche d’entretien.');
      }
      if (agents.length !== assignedTo.length) throw new AppError(400, 'Un ou plusieurs Agents d’entretien sélectionnés sont introuvables ou inactifs.');
      if (activeTask && (activeTask.assignedTo || activeTask.assignments.length || activeTask.status !== 'PENDING')) {
        throw new AppError(409, 'Une tâche d’entretien est déjà affectée ou en cours pour cette chambre.');
      }

      const taskData = {
        title: taskTitles[taskType],
        notes: notes || null,
        taskType,
        priority,
        dueAt: dueAt ? new Date(dueAt) : null,
        assignedTo: assignedTo[0],
        activeRoomId: roomId,
      };
      const task = activeTask
        ? await tx.housekeepingTask.update({
          where: { id: activeTask.id },
          data: taskData,
          select: { id: true, title: true },
        })
        : await tx.housekeepingTask.create({
          data: {
            roomId,
            createdBy: scope.userId,
            ...taskData,
          },
          select: { id: true, title: true },
        });
      await tx.housekeepingTaskAssignment.createMany({ data: assignedTo.map((agentId) => ({ taskId: task.id, agentId })) });
      await tx.room.update({
        where: { id: room.id },
        data: {
          housekeepingStatus: 'TO_CLEAN',
          ...(room.status === 'AVAILABLE' ? { status: 'DIRTY' } : {}),
        },
      });
      const roomHistory = [
        ...(room.housekeepingStatus !== 'TO_CLEAN' ? [{
            roomId: room.id,
            dimension: 'HOUSEKEEPING',
            previousStatus: room.housekeepingStatus,
            nextStatus: 'TO_CLEAN',
            reason: taskTitles[taskType],
            source: 'HOUSEKEEPING_ASSIGNMENT',
            actorId: scope.userId,
        }] : []),
        ...(room.status === 'AVAILABLE' ? [{
            roomId: room.id,
            dimension: 'OCCUPATION',
            previousStatus: room.status,
            nextStatus: 'DIRTY',
            reason: 'Chambre réservée aux travaux d’entretien',
            source: 'HOUSEKEEPING_ASSIGNMENT',
            actorId: scope.userId,
        }] : []),
      ];
      if (roomHistory.length) await tx.roomStatusHistory.createMany({ data: roomHistory });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'HOUSEKEEPING_TASK_ASSIGN',
          result: 'SUCCESS',
          targetId: task.id,
          details: { roomId, assignedTo, title: taskTitles[taskType], taskType },
        },
      });
      return task;
    });

    return NextResponse.json({ task: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (isDuplicateActiveRoom(error)) return NextResponse.json({ error: 'Une tâche d’entretien est déjà ouverte pour cette chambre.' }, { status: 409 });
    throw error;
  }
}

const updateSchema = z.object({
  taskId: z.string().min(1),
  action: z.enum(['START', 'COMPLETE', 'SUBMIT_FOR_INSPECTION', 'INSPECTION_PASSED', 'INSPECTION_FAILED']),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(request: Request) {
  try {
    const { scope, isManager } = await housekeepingActor();
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'La mise à jour de la tâche est invalide.' }, { status: 400 });
    const { taskId, action, note } = parsed.data;
    const inspectionAction = action === 'INSPECTION_PASSED' || action === 'INSPECTION_FAILED';
    if (inspectionAction && !isManager) throw new AppError(403, 'Seule la Gouvernante peut inspecter une chambre.');
    if (!inspectionAction && isManager) throw new AppError(403, 'La Gouvernante supervise les tâches mais ne les exécute pas.');
    if (action === 'INSPECTION_FAILED' && (note?.length ?? 0) < 3) {
      return NextResponse.json({ error: 'Indiquez les corrections à effectuer avant de renvoyer la tâche.' }, { status: 400 });
    }

    const task = await db.housekeepingTask.findUnique({
      where: { id: taskId },
      select: { id: true, roomId: true, title: true, assignedTo: true, status: true, assignments: { select: { agentId: true } } },
    });
    if (!task) return NextResponse.json({ error: 'Tâche introuvable.' }, { status: 404 });
    if (!isManager && task.assignedTo !== scope.userId && !task.assignments.some((assignment) => assignment.agentId === scope.userId)) {
      throw new AppError(403, 'Cette tâche n’est pas affectée à votre compte.');
    }
    const transition = housekeepingTransition(task.status, action);
    if (!transition) return NextResponse.json({ error: 'Cette transition n’est pas autorisée pour l’état actuel de la tâche.' }, { status: 409 });

    const updated = await db.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.housekeepingTask.updateMany({
        where: {
          id: task.id,
          status: task.status,
          ...(isManager ? {} : { OR: [{ assignedTo: scope.userId }, { assignments: { some: { agentId: scope.userId } } }] }),
        },
        data: {
          status: transition.to,
          ...(action === 'START' ? { startedAt: now } : {}),
          ...(action === 'SUBMIT_FOR_INSPECTION' ? { readyForInspectionAt: now } : {}),
          ...(inspectionAction ? { inspectedBy: scope.userId, inspectedAt: now, inspectionNote: note || null } : {}),
          ...(action === 'INSPECTION_PASSED' || action === 'COMPLETE' ? { activeRoomId: null } : {}),
        },
      });
      if (changed.count !== 1) return false;

      const room = await tx.room.findUnique({ where: { id: task.roomId }, select: { id: true, status: true, housekeepingStatus: true, technicalStatus: true, active: true } });
      if (!room) throw new AppError(404, 'Chambre introuvable.');
      const nextHousekeepingStatus = room.housekeepingStatus === 'OUT_OF_SERVICE' ? 'OUT_OF_SERVICE' : transition.roomStatus;
      const nextRoomStatus = (action === 'COMPLETE' || action === 'INSPECTION_PASSED')
        && room.status === 'DIRTY'
        && room.technicalStatus === 'OPERATIONAL'
        && room.active
        && nextHousekeepingStatus !== 'OUT_OF_SERVICE'
        ? 'AVAILABLE'
        : room.status;
      await tx.room.update({
        where: { id: room.id },
        data: {
          housekeepingStatus: nextHousekeepingStatus,
          ...(nextRoomStatus !== room.status ? { status: nextRoomStatus } : {}),
        },
      });
      const roomHistory = [
        ...(room.housekeepingStatus !== nextHousekeepingStatus ? [{
            roomId: room.id,
            dimension: 'HOUSEKEEPING',
            previousStatus: room.housekeepingStatus,
            nextStatus: nextHousekeepingStatus,
            reason: note || task.title,
            source: `HOUSEKEEPING_${action}`,
            actorId: scope.userId,
        }] : []),
        ...(nextRoomStatus !== room.status ? [{
            roomId: room.id,
            dimension: 'OCCUPATION',
            previousStatus: room.status,
            nextStatus: nextRoomStatus,
            reason: 'Tâche d’entretien terminée',
            source: `HOUSEKEEPING_${action}`,
            actorId: scope.userId,
        }] : []),
      ];
      if (roomHistory.length) await tx.roomStatusHistory.createMany({ data: roomHistory });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: `HOUSEKEEPING_${action}`,
          result: 'SUCCESS',
          targetId: task.id,
          details: { roomId: task.roomId, from: task.status, to: transition.to, note: note || null },
        },
      });
      return true;
    });

    if (!updated) return NextResponse.json({ error: 'La tâche a changé depuis son affichage. Actualisez la liste.' }, { status: 409 });
    return NextResponse.json({ ok: true, status: transition.to });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}


import { NextResponse } from 'next/server';
import { assertAssignedRoom, authorizedScope, roomAssignmentWhere } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelDateKey, parseDateOnly } from '@/server/reception';
import { hotelConfiguration } from '@/server/hotel';
import { nightlyRatePolicy } from '@/features/reception/domain';
import { convertFromXaf } from '@/server/currency';
import { z } from 'zod';

export const instant = false;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = await authorizedScope('rooms.view');
    const configuration = await hotelConfiguration();
    const startText = url.searchParams.get('from') ?? hotelDateKey(new Date(), configuration.timezone);
    const start = parseDateOnly(startText);
    const endText = url.searchParams.get('to') ?? new Date(start.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
    const end = parseDateOnly(endText);
    if (end <= start || end.getTime() - start.getTime() > 62 * 86_400_000) {
      return NextResponse.json({ error: 'La période doit être comprise entre 1 et 62 jours.' }, { status: 400 });
    }

    const breakfast = await db.restaurantMenuItem.findUnique({
      where: { code: 'BREAKFAST_ROOM_NIGHT' },
      select: { active: true, price: true },
    });
    const rooms = await db.room.findMany({
      where: { active: true, ...roomAssignmentWhere(scope) },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
      include: {
        category: { select: { name: true, capacity: true, nightlyRate: true } },
        housekeepingTasks: {
          where: { status: { not: 'COMPLETED' } },
          select: { id: true, title: true, notes: true, status: true },
          take: 1,
        },
        statusHistory: {
          where: { dimension: 'OCCUPATION', nextStatus: 'OUT_OF_SERVICE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { reason: true, source: true },
        },
        incidents: {
          where: { status: { not: 'RESOLVED' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { title: true },
        },
        reservations: {
          where: {
            status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
            checkInDate: { lt: end },
            checkOutDate: { gt: start },
          },
          orderBy: { checkInDate: 'asc' },
          select: {
            id: true,
            reference: true,
            status: true,
            stayType: true,
            checkInDate: true,
            checkOutDate: true,
            plannedCheckInAt: true,
            plannedCheckOutAt: true,
            stay: { select: { checkedInAt: true, expectedCheckOutAt: true } },
            client: { select: { name: true } },
          },
        },
      },
    });
    const activeStays = rooms.length ? await db.reservation.findMany({
      where: { roomId: { in: rooms.map((room) => room.id) }, stay: { is: { checkedOutAt: null } } },
      include: { client: { select: { name: true } }, folio: { include: { lines: { select: { amount: true, restaurantOrderId: true } }, payments: { select: { amount: true } } } } },
    }) : [];
    const guestByRoom = new Map(activeStays.flatMap((stay) => stay.roomId ? [[stay.roomId, {
      name: stay.client.name,
      restaurantBilled: stay.folio?.lines.filter((line) => line.restaurantOrderId !== null).reduce((sum, line) => sum + Number(line.amount), 0) ?? 0,
      folioBalance: stay.folio ? Math.max(0, stay.folio.lines.reduce((sum, line) => sum + Number(line.amount), 0) - stay.folio.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)) : 0,
    }] as const] : []));
    const presentedRooms = await Promise.all(rooms.map(async (room) => {
      const isHotelAdmin = scope.roleCode === 'HOTEL_ADMIN';
      const canSeeTasks = !isHotelAdmin || scope.permissions.includes('housekeeping.tasks.view');
      const canSeeMaintenance = !isHotelAdmin || scope.permissions.includes('maintenance.view');
      const canSeeRates = !isHotelAdmin || scope.permissions.includes('rooms.rates.view');
      const currentStay = guestByRoom.get(room.id);
      const currentGuest = currentStay?.name ?? null;
      const nightlyMinimum = (room.nightlyRateMin ?? room.category.nightlyRate).toFixed(2);
      const nightlyMaximum = (room.nightlyRateMax ?? room.category.nightlyRate).toFixed(2);
      const policyInXaf = nightlyRatePolicy(nightlyMinimum, nightlyMaximum);
      const [minimum, maximum, categoryRate, breakfastPrice] = canSeeRates
        ? await Promise.all([
          convertFromXaf(policyInXaf.minimum, configuration.currency),
          convertFromXaf(policyInXaf.maximum, configuration.currency),
          convertFromXaf(room.category.nightlyRate, configuration.currency),
          breakfast?.active ? convertFromXaf(breakfast.price, configuration.currency) : Promise.resolve(null),
        ])
        : [null, null, null, null];
      const ratePolicy = {
        ...policyInXaf,
        minimum: minimum?.toFixed(2) ?? policyInXaf.minimum,
        maximum: maximum?.toFixed(2) ?? policyInXaf.maximum,
      };
      const reason = [
        ...(canSeeTasks && room.housekeepingTasks[0] ? [room.housekeepingTasks[0].title, room.housekeepingTasks[0].notes] : []),
        ...(canSeeMaintenance ? [room.statusHistory[0]?.reason, room.incidents[0]?.title] : []),
      ].filter(Boolean).join(' · ');
      return {
        id: room.id,
        number: room.number,
        floor: room.floor,
        status: currentGuest ? 'OCCUPIED' : room.status === 'OCCUPIED'
          ? (room.housekeepingStatus === 'CLEAN' && room.technicalStatus === 'OPERATIONAL' ? 'AVAILABLE' : 'DIRTY')
          : room.status,
        housekeepingStatus: room.housekeepingStatus,
        technicalStatus: room.technicalStatus,
        active: room.active,
        hasOpenHousekeepingTask: canSeeTasks && room.housekeepingTasks.length > 0,
        receptionistBlocked: room.status === 'OUT_OF_SERVICE' && room.statusHistory[0]?.source === 'RECEPTIONIST_ROOM_BLOCK',
        unavailableReason: reason || (room.status === 'OUT_OF_SERVICE' ? 'Indisponible' : null),
        currentGuest,
        restaurantBilled: currentStay?.restaurantBilled ?? 0,
        folioBalance: currentStay?.folioBalance ?? 0,
        category: room.category.name,
        capacity: room.category.capacity,
        ...(!canSeeRates ? {} : {
          nightlyRateMin: minimum!.toFixed(2),
          nightlyRateMax: maximum!.toFixed(2),
          nightlyRate: categoryRate!.toFixed(2),
          breakfastPriceInput: breakfastPrice?.toFixed(2) ?? null,
        }),
        reservations: room.reservations.filter((reservation) => !isHotelAdmin
          || scope.permissions.includes('reservations.view')
          || (scope.permissions.includes('stays.view') && reservation.status === 'CHECKED_IN')).map((reservation) => ({
          ...reservation,
          checkInDate: reservation.checkInDate.toISOString().slice(0, 10),
          checkOutDate: reservation.checkOutDate.toISOString().slice(0, 10),
          plannedCheckInAt: reservation.plannedCheckInAt?.toISOString() ?? null,
          plannedCheckOutAt: reservation.plannedCheckOutAt?.toISOString() ?? null,
          stay: reservation.stay ? {
            checkedInAt: reservation.stay.checkedInAt.toISOString(),
            expectedCheckOutAt: reservation.stay.expectedCheckOutAt?.toISOString() ?? null,
          } : null,
          ...(reservation.status === 'CHECKED_IN' ? { client: { name: reservation.client.name } } : {}),
        })),
      };
    }));
    return NextResponse.json({
      from: startText,
      to: endText,
      rooms: presentedRooms,
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

const roomAvailabilitySchema = z.object({
  roomId: z.string().min(1),
  action: z.enum(['BLOCK', 'RELEASE']),
  reason: z.string().trim().min(3).max(500),
});

export async function PATCH(request: Request) {
  try {
    const parsed = roomAvailabilitySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Indiquez une chambre, une action et un motif d’au moins 3 caractères.' }, { status: 400 });
    const { roomId, action, reason } = parsed.data;
    const scope = await authorizedScope(action === 'BLOCK' ? 'rooms.block' : 'rooms.release');
    await assertAssignedRoom(scope, roomId);

    const room = await db.$transaction(async (tx) => {
      const lockedRoom = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE`;
      if (!lockedRoom.length) throw new AppError(404, 'Chambre introuvable.');
      const before = await tx.room.findUnique({
        where: { id: roomId },
        include: { reservations: { where: { stay: { is: { checkedOutAt: null } } }, select: { id: true } } },
      });
      if (!before) throw new AppError(404, 'Chambre introuvable.');
      const effectivePreviousStatus = before.status === 'OCCUPIED' && !before.reservations.length
        ? (before.housekeepingStatus === 'CLEAN' && before.technicalStatus === 'OPERATIONAL' ? 'AVAILABLE' : 'DIRTY')
        : before.status;

      if (action === 'BLOCK') {
        if (before.status === 'OUT_OF_SERVICE') throw new AppError(409, 'Cette chambre est déjà indisponible.');
        if (before.reservations.length) {
          throw new AppError(409, 'Une chambre occupée ne peut pas être rendue indisponible. Effectuez d’abord le changement de chambre ou le départ.');
        }
        if (before.technicalStatus !== 'OPERATIONAL') throw new AppError(409, 'Cette chambre est déjà indisponible pour une intervention technique.');
        const updated = await tx.room.update({
          where: { id: roomId },
          data: { status: 'OUT_OF_SERVICE', housekeepingStatus: 'OUT_OF_SERVICE' },
        });
        await tx.roomStatusHistory.createMany({ data: [
          { roomId, dimension: 'OCCUPATION', previousStatus: effectivePreviousStatus, nextStatus: 'OUT_OF_SERVICE', reason, source: 'RECEPTIONIST_ROOM_BLOCK', actorId: scope.userId },
          { roomId, dimension: 'HOUSEKEEPING', previousStatus: before.housekeepingStatus, nextStatus: 'OUT_OF_SERVICE', reason, source: 'RECEPTIONIST_ROOM_BLOCK', actorId: scope.userId },
        ] });
        await tx.auditLog.create({ data: { actorId: scope.userId, action: 'RECEPTIONIST_ROOM_BLOCK', result: 'SUCCESS', targetId: roomId, details: { reason } } });
        return updated;
      }

      if (before.status !== 'OUT_OF_SERVICE') throw new AppError(409, 'Cette chambre n’est pas bloquée.');
      if (before.technicalStatus !== 'OPERATIONAL') throw new AppError(409, 'Seule l’équipe Maintenance peut lever un blocage technique.');
      const activeTask = await tx.housekeepingTask.findFirst({ where: { roomId, status: { not: 'COMPLETED' } }, select: { id: true } });
      if (activeTask) throw new AppError(409, 'Terminez d’abord la tâche d’entretien avant de remettre la chambre à disposition.');
      const previousBlock = await tx.roomStatusHistory.findFirst({
        where: { roomId, dimension: 'OCCUPATION', nextStatus: 'OUT_OF_SERVICE', source: 'RECEPTIONIST_ROOM_BLOCK' },
        orderBy: { createdAt: 'desc' },
        select: { previousStatus: true },
      });
      const previousHousekeeping = await tx.roomStatusHistory.findFirst({
        where: { roomId, dimension: 'HOUSEKEEPING', nextStatus: 'OUT_OF_SERVICE', source: 'RECEPTIONIST_ROOM_BLOCK' },
        orderBy: { createdAt: 'desc' },
        select: { previousStatus: true },
      });
      const nextStatus = previousBlock?.previousStatus === 'AVAILABLE' ? 'AVAILABLE' : 'DIRTY';
      const nextHousekeepingStatus = previousHousekeeping?.previousStatus && previousHousekeeping.previousStatus !== 'OUT_OF_SERVICE'
        ? previousHousekeeping.previousStatus as typeof before.housekeepingStatus
        : 'TO_CLEAN';
      const updated = await tx.room.update({ where: { id: roomId }, data: { status: nextStatus, housekeepingStatus: nextHousekeepingStatus } });
      await tx.roomStatusHistory.createMany({ data: [
        { roomId, dimension: 'OCCUPATION', previousStatus: before.status, nextStatus, reason, source: 'RECEPTIONIST_ROOM_RELEASE', actorId: scope.userId },
        { roomId, dimension: 'HOUSEKEEPING', previousStatus: before.housekeepingStatus, nextStatus: nextHousekeepingStatus, reason, source: 'RECEPTIONIST_ROOM_RELEASE', actorId: scope.userId },
      ] });
      await tx.auditLog.create({ data: { actorId: scope.userId, action: 'RECEPTIONIST_ROOM_RELEASE', result: 'SUCCESS', targetId: roomId, details: { reason, nextStatus, nextHousekeepingStatus } } });
      return updated;
    });
    return NextResponse.json({ room: { id: room.id, status: room.status, housekeepingStatus: room.housekeepingStatus } });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}


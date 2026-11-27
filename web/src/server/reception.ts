import 'server-only';
import { Prisma } from '@prisma/client';
import { dateRangesOverlap, localDateTimeToUtc, nightsBetween, periodStartInTimeZone, timeRangesOverlap, type StatPeriod } from '@/features/reception/domain';
import { AppError } from './policy';
import { isRoomAssignableToGuest } from '@/features/housekeeping/domain';

type Transaction = Prisma.TransactionClient;

export function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, 'Date invalide.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, 'Date invalide.');
  }
  return date;
}

export function hotelDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function parseHotelDateTime(value: string, timezone: string) {
  try {
    return localDateTimeToUtc(value, timezone);
  } catch (error) {
    if (error instanceof RangeError) throw new AppError(400, error.message);
    throw error;
  }
}

export function countNights(checkIn: Date, checkOut: Date) {
  return nightsBetween(checkIn.toISOString().slice(0, 10), checkOut.toISOString().slice(0, 10));
}

export function datesOverlap(
  existingStart: Date,
  existingEnd: Date,
  requestedStart: Date,
  requestedEnd: Date,
) {
  return dateRangesOverlap(
    existingStart.toISOString().slice(0, 10),
    existingEnd.toISOString().slice(0, 10),
    requestedStart.toISOString().slice(0, 10),
    requestedEnd.toISOString().slice(0, 10),
  );
}

export async function lockAndCheckRoom(
  tx: Transaction,
  roomId: string,
  checkInDate: Date,
  checkOutDate: Date,
  options: {
    excludeReservationId?: string;
    allowDirtyForFuture?: boolean;
    plannedCheckInAt?: Date;
    plannedCheckOutAt?: Date;
  } = {},
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM Room WHERE id = ${roomId} FOR UPDATE
  `;
  if (!locked.length) throw new AppError(404, 'Chambre introuvable.');

  const room = await tx.room.findFirst({
    where: { id: roomId },
    include: {
      category: true,
      housekeepingTasks: {
        where: { status: { not: 'COMPLETED' } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!room || !room.category.active) {
    throw new AppError(409, 'La catégorie de cette chambre n’est pas disponible.');
  }
  if (room.status === 'OUT_OF_SERVICE') throw new AppError(409, 'Cette chambre est hors service.');
  if (!room.active) throw new AppError(409, 'Cette chambre est désactivée.');
  if (room.technicalStatus !== 'OPERATIONAL') throw new AppError(409, 'Cette chambre est indisponible pour maintenance ou intervention technique.');
  if (room.housekeepingTasks.length) throw new AppError(409, 'Cette chambre est indisponible pendant une tâche de nettoyage ou de préparation.');
  if (!isRoomAssignableToGuest({
    active: room.active,
    status: room.status,
    housekeepingStatus: room.housekeepingStatus,
    technicalStatus: room.technicalStatus,
    hasOpenHousekeepingTask: false,
    allowDirtyForFuture: options.allowDirtyForFuture ?? false,
  })) throw new AppError(409, 'Cette chambre n’est pas prête pour l’attribution.');
  if (room.status === 'DIRTY' && !options.allowDirtyForFuture) {
    throw new AppError(409, 'Cette chambre doit être remise en état avant son attribution.');
  }
  if (room.housekeepingStatus !== 'CLEAN' && !options.allowDirtyForFuture) {
    throw new AppError(409, 'Le housekeeping doit déclarer cette chambre propre avant son attribution.');
  }

  const reservations = await tx.reservation.findMany({
    where: {
      roomId,
      status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
      OR: [
        { checkInDate: { lt: checkOutDate }, checkOutDate: { gt: checkInDate } },
        ...(options.plannedCheckInAt && options.plannedCheckOutAt ? [{
          plannedCheckInAt: { lt: options.plannedCheckOutAt },
          plannedCheckOutAt: { gt: options.plannedCheckInAt },
        }] : []),
      ],
      ...(options.excludeReservationId ? { id: { not: options.excludeReservationId } } : {}),
    },
    select: {
      id: true,
      checkInDate: true,
      checkOutDate: true,
      plannedCheckInAt: true,
      plannedCheckOutAt: true,
      status: true,
      stay: { select: { checkedInAt: true, expectedCheckOutAt: true } },
    },
  });
  const conflict = reservations.some((reservation) => {
    const actualStart = reservation.status === 'CHECKED_IN' ? reservation.stay?.checkedInAt : null;
    const actualEnd = reservation.status === 'CHECKED_IN' ? reservation.stay?.expectedCheckOutAt : null;
    const existingStart = actualStart ?? reservation.plannedCheckInAt;
    const existingEnd = actualEnd ?? reservation.plannedCheckOutAt;
    if (options.plannedCheckInAt && options.plannedCheckOutAt && existingStart && existingEnd) {
      return timeRangesOverlap(options.plannedCheckInAt, options.plannedCheckOutAt, existingStart, existingEnd);
    }
    return datesOverlap(reservation.checkInDate, reservation.checkOutDate, checkInDate, checkOutDate);
  });
  if (conflict) throw new AppError(409, 'La chambre est déjà réservée sur cette période.');
  return room;
}

export function folioTotals(folio: { lines: { amount: Prisma.Decimal }[]; payments: { amount: Prisma.Decimal }[] }) {
  const billed = folio.lines.reduce((total, line) => total.add(line.amount), new Prisma.Decimal(0));
  const paid = folio.payments.reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0));
  return { billed, paid, balance: Prisma.Decimal.max(billed.sub(paid), 0) };
}

export function parsePeriod(value: string | null): StatPeriod {
  return value === 'week' || value === 'month' || value === 'year' ? value : 'day';
}

/** Period boundaries in the hotel timezone for personal statistics. */
export function periodRange(period: StatPeriod, now: Date, timezone: string) {
  return { start: periodStartInTimeZone(period, now, timezone), end: now };
}

/**
 * Queue in-app notifications for active account recipients.
 * Pass excludeUserId when the actor should not receive a copy.
 */
export async function notifyReceptionStaff(
  tx: Transaction,
  recipientIds: (string | null | undefined)[],
  message: string,
  excludeUserId?: string,
) {
  const recipients = [...new Set(recipientIds.filter((id): id is string => Boolean(id) && id !== excludeUserId))];
  if (!recipients.length) return;
  const staff = await tx.user.findMany({
    where: { id: { in: recipients }, active: true },
    select: { id: true },
  });
  if (!staff.length) return;
  await tx.notification.createMany({
    data: staff.map((user) => ({ userId: user.id, message: message.slice(0, 500) })),
  });
}

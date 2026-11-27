import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAssignedRoom, authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { countNights, folioTotals, hotelDateKey, lockAndCheckRoom, parseDateOnly, parseHotelDateTime } from '@/server/reception';
import { isRateOutsideRange, nightlyRatePolicy, siestaEndAt } from '@/features/reception/domain';
import { convertFromXaf, convertToXaf } from '@/server/currency';

export const instant = false;

const includeReservation = {
  client: { select: { id: true, name: true, phone: true, email: true } },
  room: { include: { category: { select: { name: true, capacity: true } } } },
  creator: { select: { id: true, name: true } },
  folio: { include: { lines: { select: { amount: true } }, payments: { select: { amount: true } }, invoice: true } },
  stay: {
    select: {
      checkedInAt: true,
      checkInRecordedAt: true,
      expectedCheckOutAt: true,
      checkedOutAt: true,
      checkOutRecordedAt: true,
    },
  },
} satisfies Prisma.ReservationInclude;

type ReservationVisibility = { canViewClientContact: boolean; canViewFinancial: boolean; canViewRates: boolean };

function presentReservation(reservation: Prisma.ReservationGetPayload<{ include: typeof includeReservation }>, visibility: ReservationVisibility) {
  const totals = reservation.folio ? folioTotals(reservation.folio) : null;
  return {
    id: reservation.id,
    reference: reservation.reference,
    status: reservation.status,
    stayType: reservation.stayType,
    client: {
      id: reservation.client.id,
      name: reservation.client.name,
      ...(visibility.canViewClientContact ? { phone: reservation.client.phone, email: reservation.client.email } : {}),
    },
    room: reservation.room
      ? { id: reservation.room.id, number: reservation.room.number, category: reservation.room.category.name }
      : null,
    createdBy: reservation.createdBy,
    createdByName: reservation.createdByName ?? reservation.creator?.name ?? null,
    createdAt: reservation.createdAt,
    checkInDate: reservation.checkInDate.toISOString().slice(0, 10),
    checkOutDate: reservation.checkOutDate.toISOString().slice(0, 10),
    plannedCheckInAt: reservation.plannedCheckInAt,
    plannedCheckOutAt: reservation.plannedCheckOutAt,
    adults: reservation.adults,
    children: reservation.children,
    nightlyRate: visibility.canViewRates || visibility.canViewFinancial ? reservation.nightlyRate.toFixed(2) : null,
    rateReason: visibility.canViewRates ? reservation.rateReason : null,
    totalAmount: visibility.canViewFinancial ? reservation.totalAmount.toFixed(2) : null,
    checkedInAt: reservation.checkedInAt,
    checkedOutAt: reservation.checkedOutAt,
    stay: reservation.stay ? {
      checkedInAt: reservation.stay.checkedInAt,
      checkInRecordedAt: reservation.stay.checkInRecordedAt,
      expectedCheckOutAt: reservation.stay.expectedCheckOutAt,
      checkedOutAt: reservation.stay.checkedOutAt,
      checkOutRecordedAt: reservation.stay.checkOutRecordedAt,
    } : null,
    folio: visibility.canViewFinancial && reservation.folio ? {
      id: reservation.folio.id,
      billed: totals?.billed.toFixed(2) ?? '0.00',
      paid: totals?.paid.toFixed(2) ?? '0.00',
      balance: totals?.balance.toFixed(2) ?? '0.00',
      invoiceNumber: reservation.folio.invoice?.number ?? null,
    } : null,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = await authorizedScope('reservations.view');
    const query = url.searchParams.get('q')?.trim() ?? '';
    const statusFilter = (url.searchParams.get('status')?.trim().toUpperCase().split(',') ?? [])
      .filter((value): value is 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'CHECKED_IN' | 'CHECKED_OUT' =>
        ['PENDING', 'CONFIRMED', 'CANCELLED', 'CHECKED_IN', 'CHECKED_OUT'].includes(value));
    const period = url.searchParams.get('period') ?? 'all';
    const configuration = await hotelConfiguration();
    const today = parseDateOnly(hotelDateKey(new Date(), configuration.timezone));
    let periodWhere: Prisma.ReservationWhereInput = {};
    if (period === 'upcoming') periodWhere = { checkOutDate: { gt: today }, status: { in: ['PENDING', 'CONFIRMED'] } };
    if (period === 'past') periodWhere = { checkOutDate: { lte: today }, status: { in: ['CANCELLED', 'CHECKED_OUT'] } };
    if (period === 'inhouse') periodWhere = { status: 'CHECKED_IN' };
    const reservations = await db.reservation.findMany({
      where: {
        AND: [
          ...(scope.roleCode === 'HOTEL_ADMIN' ? [{ room: { is: { assignedHotelAdminId: scope.userId } } }] : []),
          ...(statusFilter.length ? [{ status: { in: statusFilter } }] : []),
          periodWhere,
          query ? {
            OR: [
              { reference: { contains: query } },
              { client: { name: { contains: query } } },
              { client: { phone: { contains: query } } },
              { room: { number: { contains: query } } },
            ],
          } : {},
        ],
      },
      orderBy: [{ checkInDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: includeReservation,
    });
    const visibility = { canViewClientContact: scope.permissions.includes('clients.view'), canViewFinancial: scope.roleCode !== 'HOTEL_ADMIN' || scope.permissions.includes('reports.financial.view'), canViewRates: scope.roleCode !== 'HOTEL_ADMIN' || scope.permissions.includes('rooms.rates.view') };
    return NextResponse.json({
      reservations: await Promise.all(reservations.map(async (reservation) => ({
        ...presentReservation(reservation, visibility),
        nightlyRateInput: visibility.canViewRates || visibility.canViewFinancial
          ? reservation.inputNightlyRate && reservation.inputCurrency === configuration.currency
            ? reservation.inputNightlyRate.toFixed(2)
            : (await convertFromXaf(reservation.nightlyRate, configuration.currency)).toFixed(2)
          : null,
      }))),
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

const createSchema = z.object({
  clientId: z.string().min(1),
  roomId: z.string().min(1).optional(),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  stayType: z.enum(['SIESTA', 'OVERNIGHT']).default('OVERNIGHT'),
  agreedRate: z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/).optional(),
  rateReason: z.string().trim().max(500).optional(),
  includeBreakfast: z.boolean().default(false),
  includeCommission: z.boolean().default(false),
  breakfastName: z.string().trim().min(2).max(160).default('Petit-déjeuner'),
  adults: z.number().int().min(1).max(2147483647).default(1),
  children: z.number().int().min(0).max(2147483647).default(0),
  idempotencyKey: z.string().min(16).max(100),
}).superRefine((value, context) => {
  if (value.stayType === 'OVERNIGHT' && !value.checkOutDate) {
    context.addIssue({ code: 'custom', path: ['checkOutDate'], message: 'Date de départ obligatoire.' });
  }
  if (value.stayType === 'SIESTA' && !value.checkInTime) {
    context.addIssue({ code: 'custom', path: ['checkInTime'], message: 'Heure d’arrivée obligatoire pour une sieste.' });
  }
  if (value.roomId && !value.agreedRate) {
    context.addIssue({ code: 'custom', path: ['agreedRate'], message: 'Tarif obligatoire lorsqu’une chambre est choisie.' });
  }
  if (!value.roomId && value.agreedRate && new Prisma.Decimal(value.agreedRate).gt(0)) {
    context.addIssue({ code: 'custom', path: ['agreedRate'], message: 'Le tarif sera défini lors de l’attribution de la chambre.' });
  }
  if (value.includeBreakfast && (!value.roomId || value.stayType !== 'OVERNIGHT')) {
    context.addIssue({ code: 'custom', path: ['includeBreakfast'], message: 'Le petit déjeuner est disponible uniquement avec une chambre en nuitée.' });
  }
  if (value.includeCommission && (!value.roomId || value.stayType !== 'OVERNIGHT')) {
    context.addIssue({ code: 'custom', path: ['includeCommission'], message: 'La commission est disponible uniquement avec une chambre en nuitée.' });
  }
});

export async function POST(request: Request) {
  let retryContext: {
    idempotencyKey: string;
    clientId: string;
    roomId: string | null;
    checkInDate: Date;
    checkOutDate: Date;
    stayType: 'SIESTA' | 'OVERNIGHT';
    plannedCheckInAt: Date;
    plannedCheckOutAt: Date;
    adults: number;
    children: number;
    agreedRate: string;
    inputCurrency: string;
    rateReason: string | null;
  } | null = null;
  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join('.');
      return NextResponse.json({ error: issue ? `${field ? `${field} : ` : ''}${issue.message}` : 'Les informations de réservation sont invalides.' }, { status: 400 });
    }
    const input = parsed.data;
    const scope = await authorizedScope('reservations.create');
    const visibility = { canViewClientContact: scope.permissions.includes('clients.view'), canViewFinancial: scope.roleCode !== 'HOTEL_ADMIN' || scope.permissions.includes('reports.financial.view'), canViewRates: scope.roleCode !== 'HOTEL_ADMIN' || scope.permissions.includes('rooms.rates.view') };
    if (scope.roleCode === 'HOTEL_ADMIN' && !input.roomId) throw new AppError(400, 'Une réservation Administrateur Hôtel doit concerner une chambre attribuée.');
    if (input.roomId) await assertAssignedRoom(scope, input.roomId);
    const configuration = await hotelConfiguration();
    const inputRate = input.roomId ? input.agreedRate! : '0';
    const rate = await convertToXaf(inputRate, configuration.currency);
    const checkInDate = parseDateOnly(input.checkInDate);
    const today = hotelDateKey(new Date(), configuration.timezone);
    let checkOutDate: Date;
    let plannedCheckInAt: Date;
    let plannedCheckOutAt: Date;
    let nights = 0;

    if (input.stayType === 'OVERNIGHT') {
      if (!input.checkOutDate) throw new AppError(400, 'La date de départ est obligatoire.');
      if (!configuration.checkOutTime) {
        throw new AppError(409, 'L’heure conventionnelle de départ doit d’abord être configurée.');
      }
      checkOutDate = parseDateOnly(input.checkOutDate);
      nights = countNights(checkInDate, checkOutDate);
      plannedCheckInAt = parseHotelDateTime(`${input.checkInDate}T${configuration.checkOutTime}`, configuration.timezone);
      plannedCheckOutAt = parseHotelDateTime(`${input.checkOutDate}T${configuration.checkOutTime}`, configuration.timezone);
      if (!nights || nights > 365 || input.checkInDate < today || plannedCheckOutAt <= plannedCheckInAt) {
        return NextResponse.json({ error: 'La période doit durer de 1 à 365 nuits et ses horaires doivent être valides.' }, { status: 400 });
      }
    } else {
      if (!input.checkInTime) throw new AppError(400, 'L’heure d’arrivée est obligatoire pour une sieste.');
      plannedCheckInAt = parseHotelDateTime(`${input.checkInDate}T${input.checkInTime}`, configuration.timezone);
      plannedCheckOutAt = siestaEndAt(plannedCheckInAt);
      const endDay = hotelDateKey(plannedCheckOutAt, configuration.timezone);
      const checkoutDay = endDay === input.checkInDate
        ? new Date(Date.parse(`${endDay}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10)
        : endDay;
      checkOutDate = parseDateOnly(checkoutDay);
      if (input.checkInDate < today) {
        return NextResponse.json({ error: 'Une sieste ne peut pas être réservée dans le passé.' }, { status: 400 });
      }
    }
    retryContext = {
      idempotencyKey: input.idempotencyKey,
      clientId: input.clientId,
      roomId: input.roomId ?? null,
      checkInDate,
      checkOutDate,
      stayType: input.stayType,
      plannedCheckInAt,
      plannedCheckOutAt,
      adults: input.adults,
      children: input.children,
      agreedRate: inputRate,
      inputCurrency: configuration.currency,
      rateReason: input.rateReason?.trim() || null,
    };

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.reservation.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: includeReservation,
      });
      if (existing) {
        const sameRequest = existing.clientId === input.clientId
          && existing.roomId === (input.roomId ?? null)
          && existing.checkInDate.getTime() === checkInDate.getTime()
          && existing.checkOutDate.getTime() === checkOutDate.getTime()
          && existing.stayType === input.stayType
          && existing.plannedCheckInAt?.getTime() === plannedCheckInAt.getTime()
          && existing.plannedCheckOutAt?.getTime() === plannedCheckOutAt.getTime()
          && existing.adults === input.adults
          && existing.children === input.children
          && (existing.inputNightlyRate ?? existing.nightlyRate).equals(inputRate)
          && (existing.inputCurrency ?? 'XAF') === configuration.currency
          && existing.rateReason === (input.rateReason?.trim() || null);
        if (!sameRequest) throw new AppError(409, 'Cette clé de réservation a déjà été utilisée pour une autre demande.');
        return { reservation: existing, duplicate: true };
      }

      const [client, room] = await Promise.all([
        tx.client.findFirst({ where: { id: input.clientId }, select: { id: true, name: true } }),
        input.roomId
          ? lockAndCheckRoom(tx, input.roomId, checkInDate, checkOutDate, {
            allowDirtyForFuture: input.checkInDate > today,
            plannedCheckInAt,
            plannedCheckOutAt,
          })
          : null,
      ]);
      if (!client) throw new AppError(404, 'Client introuvable.');
      if (room && input.checkInDate <= today && room.status !== 'AVAILABLE') {
        throw new AppError(409, 'Cette chambre n’est pas disponible pour une arrivée immédiate.');
      }
      if (room && room.category.capacity !== null && input.adults + input.children > room.category.capacity) {
        throw new AppError(400, 'Le nombre d\u2019occupants dépasse la capacité de la chambre.');
      }

      if (room && !rate.gt(0)) throw new AppError(400, 'Le tarif convenu doit être supérieur à zéro.');
      const ratePolicy = room
        ? nightlyRatePolicy(
          (room.nightlyRateMin ?? room.category.nightlyRate).toFixed(2),
          (room.nightlyRateMax ?? room.category.nightlyRate).toFixed(2),
        )
        : null;
      const breakfastItem = input.includeBreakfast
        ? await tx.restaurantMenuItem.findUnique({ where: { code: 'BREAKFAST_ROOM_NIGHT' } })
        : null;
      if (input.includeBreakfast && (!breakfastItem?.active || !room)) {
        throw new AppError(409, 'Le petit-déjeuner est actuellement indisponible. Contactez le restaurant.');
      }
      const breakfastPrice = breakfastItem?.active && room && input.includeBreakfast && input.stayType === 'OVERNIGHT'
        ? new Prisma.Decimal(breakfastItem.price)
        : new Prisma.Decimal(0);
      const commissionAmount = input.includeCommission && room && input.stayType === 'OVERNIGHT'
        ? new Prisma.Decimal(rate.lte(20000) ? 0 : rate.lte(25000) ? 2500 : 5000)
        : new Prisma.Decimal(0);
      const outsideRange = Boolean(room && input.stayType === 'OVERNIGHT'
        && ratePolicy
        && isRateOutsideRange(input.agreedRate!, ratePolicy.minimum, ratePolicy.maximum));
      const rateReason = input.rateReason?.trim() || null;
      if (outsideRange && !rateReason) {
        throw new AppError(400, 'Une justification est obligatoire pour un tarif hors de la fourchette autorisée.');
      }
      const accommodationAmount = !room
        ? new Prisma.Decimal(0)
        : input.stayType === 'SIESTA'
          ? rate
          : rate.mul(nights).toDecimalPlaces(2);
      const totalAmount = accommodationAmount.add(breakfastPrice).toDecimalPlaces(2);
      if (commissionAmount.gt(0)) {
        const [cashMethod, cashSession] = await Promise.all([
          tx.paymentMethod.findFirst({ where: { code: 'CASH', active: true }, select: { id: true } }),
          tx.cashSession.findFirst({ where: { userId: scope.userId, status: 'OPEN' }, select: { id: true } }),
        ]);
        if (!cashMethod || !cashSession) throw new AppError(409, 'Une caisse de réception ouverte est nécessaire pour déduire la commission.');
      }
      if (totalAmount.gt('99999999.99')) {
        throw new AppError(400, 'Le total du séjour dépasse la limite comptable autorisée en XAF.');
      }
      const reference = `BH-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const reservation = await tx.reservation.create({
        data: {
          clientId: input.clientId,
          roomId: room?.id ?? null,
          reference,
          idempotencyKey: input.idempotencyKey,
          stayType: input.stayType,
          checkInDate,
          checkOutDate,
          plannedCheckInAt,
          plannedCheckOutAt,
          adults: input.adults,
          children: input.children,
          nightlyRate: rate,
          inputNightlyRate: new Prisma.Decimal(inputRate),
          inputCurrency: configuration.currency,
          rateReason,
          totalAmount: accommodationAmount,
          createdBy: scope.userId,
          createdByName: scope.name,
          folio: {
            create: {
              ...(room ? { lines: {
                create: [{
                  type: 'ACCOMMODATION',
                  description: input.stayType === 'SIESTA'
                    ? 'Sieste · 3 h 30'
                    : `Hébergement · ${nights} nuit${nights > 1 ? 's' : ''}`,
                  amount: accommodationAmount,
                  createdBy: scope.userId,
                }, ...(breakfastPrice.gt(0) ? [{
                  type: 'SERVICE' as const,
                  description: input.breakfastName,
                  amount: breakfastPrice,
                  createdBy: scope.userId,
                }] : [])],
              } } : {}),
            },
          },
        },
        include: includeReservation,
      });
      if (commissionAmount.gt(0)) {
        const cashMethod = await tx.paymentMethod.findFirst({ where: { code: 'CASH', active: true }, select: { id: true } });
        const cashSession = await tx.cashSession.findFirst({ where: { userId: scope.userId, status: 'OPEN' }, select: { id: true } });
        if (!cashMethod || !cashSession) throw new AppError(409, 'La caisse de réception n’est plus ouverte.');
        await tx.payment.create({ data: {
          cashSessionId: cashSession.id,
          paymentMethodId: cashMethod.id,
          receivedBy: scope.userId,
          idempotencyKey: `COMMISSION-${reservation.id}`,
          amount: commissionAmount.neg(),
          description: `Commission réservation ${reservation.reference}`,
          reference: reservation.reference,
        } });
      }
      if (input.includeBreakfast && room && breakfastItem?.active) {
        const restaurantUsers = await tx.user.findMany({ where: { active: true, role: { code: { in: ['BAR_SERVER', 'RESTAURANT_MANAGER'] } } }, select: { id: true } });
        if (restaurantUsers.length) {
          await tx.notification.createMany({
            data: restaurantUsers.map(({ id }) => ({ userId: id, message: `${input.breakfastName} associé à la chambre ${room.number} pour ${client.name} · ${breakfastPrice.toFixed(0)} FCFA.` })),
          });
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_RESERVATION_CREATE',
          result: 'SUCCESS',
          targetId: reservation.id,
          details: {
            reference,
            roomId: room?.id ?? null,
            checkInDate: input.checkInDate,
            checkOutDate: checkOutDate.toISOString().slice(0, 10),
            stayType: input.stayType,
            agreedRate: rate.toFixed(2),
            inputAgreedRate: inputRate,
            inputCurrency: configuration.currency,
            rateReason,
            ...(input.stayType === 'OVERNIGHT' && ratePolicy ? {
              nightlyRateMin: ratePolicy.minimum,
              nightlyRateMax: ratePolicy.maximum,
              optionalMeal: ratePolicy.optionalMeal,
            } : {}),
            plannedCheckInAt: plannedCheckInAt.toISOString(),
            plannedCheckOutAt: plannedCheckOutAt.toISOString(),
            accommodationAmount: accommodationAmount.toFixed(2),
            breakfastAmount: breakfastPrice.toFixed(2),
            commissionDeductedFromCash: commissionAmount.toFixed(2),
            folioTotalAmount: totalAmount.toFixed(2),
          },
        },
      });
      return { reservation, duplicate: false };
    });

    return NextResponse.json({
      reservation: presentReservation(result.reservation, visibility),
      duplicate: result.duplicate,
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      if (retryContext) {
        const duplicate = await db.reservation.findUnique({
          where: { idempotencyKey: retryContext.idempotencyKey },
          include: includeReservation,
        });
        if (duplicate) {
          const sameRequest = duplicate.clientId === retryContext.clientId
            && duplicate.roomId === retryContext.roomId
            && duplicate.checkInDate.getTime() === retryContext.checkInDate.getTime()
            && duplicate.checkOutDate.getTime() === retryContext.checkOutDate.getTime()
            && duplicate.stayType === retryContext.stayType
            && duplicate.plannedCheckInAt?.getTime() === retryContext.plannedCheckInAt.getTime()
            && duplicate.plannedCheckOutAt?.getTime() === retryContext.plannedCheckOutAt.getTime()
            && duplicate.adults === retryContext.adults
            && duplicate.children === retryContext.children
            && (duplicate.inputNightlyRate ?? duplicate.nightlyRate).equals(retryContext.agreedRate)
            && (duplicate.inputCurrency ?? 'XAF') === retryContext.inputCurrency
            && duplicate.rateReason === retryContext.rateReason;
          if (sameRequest) {
            return NextResponse.json({
              reservation: presentReservation(duplicate, { canViewClientContact: false, canViewFinancial: false, canViewRates: false }),
              duplicate: true,
            });
          }
        }
      }
      return NextResponse.json({ error: 'Cette clé de réservation existe déjà ou entre en conflit avec une autre réservation.' }, { status: 409 });
    }
    throw error;
  }
}

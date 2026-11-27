import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { folioTotals, hotelDateKey, parseDateOnly, parseHotelDateTime, parsePeriod, periodRange } from '@/server/reception';
import { convertFromXaf } from '@/server/currency';

export const instant = false;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = parsePeriod(url.searchParams.get('period'));
    const scope = await authorizedScope('dashboard.view');
    if (scope.roleCode === 'HOTEL_ADMIN') return NextResponse.json({ error: 'Utilisez le tableau de bord de votre périmètre Administrateur Hôtel.' }, { status: 403 });
    const configuration = await hotelConfiguration();

    const now = new Date();
    const todayKey = hotelDateKey(now, configuration.timezone);
    const today = parseDateOnly(todayKey);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dayStart = parseHotelDateTime(`${todayKey}T00:00`, configuration.timezone);
    const dayEnd = parseHotelDateTime(`${tomorrow.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    const statsRange = periodRange(period, now, configuration.timezone);
    const actions = [
      'RECEPTION_CLIENT_CREATE',
      'RECEPTION_RESERVATION_CREATE',
      'RECEPTION_STAY_CHECK_IN',
      'RECEPTION_STAY_CHECK_IN_CORRECTED',
      'RECEPTION_STAY_CHECK_OUT',
    ];
    const [
      arrivals,
      pendingReservations,
      confirmedReservations,
      cancelledReservations,
      todayArrivals,
      activeStays,
      roomGroups,
      housekeepingGroups,
      allFolios,
      cashSession,
      paymentMethods,
      reservedRoomRows,
      personalEvents,
      personalPayments,
      teamEvents,
    ] = await Promise.all([
      db.reservation.count({
        where: { checkInDate: today, status: { in: ['PENDING', 'CONFIRMED'] } },
      }),
      db.reservation.count({
        where: { status: 'PENDING' },
      }),
      db.reservation.count({
        where: { status: 'CONFIRMED' },
      }),
      db.reservation.count({
        where: { status: 'CANCELLED' },
      }),
      db.reservation.findMany({
        where: { checkInDate: today, status: { in: ['PENDING', 'CONFIRMED'] } },
        orderBy: { createdAt: 'asc' },
        take: 8,
        select: {
          id: true,
          reference: true,
          status: true,
          client: { select: { name: true } },
          room: { select: { number: true } },
          plannedCheckInAt: true,
        },
      }),
      db.reservation.findMany({
        where: { stay: { is: { checkedOutAt: null } } },
        orderBy: { checkedInAt: 'asc' },
        select: {
          id: true,
          roomId: true,
          reference: true,
          stayType: true,
          nightlyRate: true,
          checkOutDate: true,
          client: { select: { name: true } },
          room: { select: { number: true, nightlyRateMin: true, nightlyRateMax: true, category: { select: { nightlyRate: true } } } },
          stay: { select: { roomId: true, checkedInAt: true, expectedCheckOutAt: true } },
        },
      }),
      db.room.findMany({ select: { id: true, number: true, floor: true, status: true, active: true, housekeepingStatus: true, technicalStatus: true, nightlyRateMin: true, nightlyRateMax: true, category: { select: { nightlyRate: true } } } }),
      db.room.groupBy({ by: ['housekeepingStatus'], _count: { _all: true } }),
      db.folio.findMany({
        select: {
          id: true,
          lines: { select: { amount: true, restaurantOrderId: true } },
          payments: { select: { amount: true } },
          invoice: { select: { number: true, totalAmount: true } },
          reservation: { select: { reference: true, client: { select: { name: true } }, room: { select: { number: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      db.cashSession.findFirst({
        where: { userId: scope.userId, status: 'OPEN' },
        select: { id: true, openingAmount: true, openedAt: true, payments: { where: { paymentMethod: { code: 'CASH' } }, select: { amount: true } } },
      }),
      db.paymentMethod.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      db.reservation.findMany({
        where: {
          checkInDate: { lte: today },
          checkOutDate: { gt: today },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        distinct: ['roomId'],
        select: { roomId: true },
      }),
      db.auditLog.groupBy({
        by: ['action'],
        where: {
          actorId: scope.userId,
          result: 'SUCCESS',
          createdAt: { gte: statsRange.start, lte: statsRange.end },
          action: { in: actions },
        },
        _count: { _all: true },
      }),
      db.payment.aggregate({
        where: { receivedBy: scope.userId, createdAt: { gte: statsRange.start, lte: statsRange.end }, amount: { gt: 0 } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      db.auditLog.findMany({
        where: {
          action: { startsWith: 'RECEPTION_' },
          result: 'SUCCESS',
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, actorId: true, action: true, targetId: true, createdAt: true },
      }),
    ]);

    const rooms = { total: 0, available: 0, occupied: 0, dirty: 0, outOfService: 0 };
    const occupiedRoomIds = new Set(activeStays.map((reservation) => reservation.roomId).filter((id): id is string => Boolean(id)));
    for (const room of roomGroups) {
      rooms.total += 1;
      if (occupiedRoomIds.has(room.id)) {
        rooms.occupied += 1;
        continue;
      }
      const effectiveStatus = room.status === 'OCCUPIED'
        ? (room.housekeepingStatus === 'CLEAN' && room.technicalStatus === 'OPERATIONAL' ? 'AVAILABLE' : 'DIRTY')
        : room.status;
      if (effectiveStatus === 'AVAILABLE') rooms.available += 1;
      if (effectiveStatus === 'DIRTY') rooms.dirty += 1;
      if (effectiveStatus === 'OUT_OF_SERVICE') rooms.outOfService += 1;
    }
    const housekeeping = { toClean: 0, inProgress: 0, toInspect: 0, maintenance: 0 };
    for (const group of housekeepingGroups) {
      if (group.housekeepingStatus === 'TO_CLEAN') housekeeping.toClean = group._count._all;
      if (group.housekeepingStatus === 'IN_PROGRESS') housekeeping.inProgress = group._count._all;
      if (group.housekeepingStatus === 'TO_INSPECT') housekeeping.toInspect = group._count._all;
      if (group.housekeepingStatus === 'OUT_OF_SERVICE') housekeeping.maintenance = group._count._all;
    }
    // Keep dayStart/dayEnd referenced for the fixed-day queue counters above.
    void dayStart; void dayEnd;

    const unsettledFolios = allFolios.map((folio) => ({ folio, ...folioTotals(folio) })).filter(({ balance }) => balance.gt(0));
    const pendingAmount = unsettledFolios.reduce((sum, { balance }) => sum.add(balance), new Prisma.Decimal(0));
    const unpaidFolios = unsettledFolios.filter(({ folio }) => folio.lines.some((line) => line.restaurantOrderId)).slice(0, 8).map(({ folio, balance }) => ({
      id: folio.id,
      reference: folio.reservation?.reference ?? '',
      clientName: folio.reservation?.client.name ?? 'Client hôtelier',
      roomNumber: folio.reservation?.room?.number ?? null,
      invoiceNumber: folio.invoice?.number ?? null,
      restaurantAmount: folio.lines.filter((line) => line.restaurantOrderId).reduce((sum, line) => sum.add(line.amount), new Prisma.Decimal(0)).toFixed(2),
      balance: balance.toFixed(2),
    }));
    const departuresToday = activeStays.filter((reservation) => {
      const expected = reservation.stay?.expectedCheckOutAt;
      const departureDate = expected
        ? hotelDateKey(expected, configuration.timezone)
        : reservation.checkOutDate.toISOString().slice(0, 10);
      return departureDate === todayKey;
    });
    const todayDepartures = departuresToday.slice(0, 8).map((reservation) => ({
      id: reservation.id,
      reference: reservation.reference,
      client: reservation.client,
      room: reservation.room,
      expectedCheckOutAt: reservation.stay?.expectedCheckOutAt,
      stayType: reservation.stayType,
    }));
    const roomById = new Map(roomGroups.map((room) => [room.id, room]));
    const occupiedRooms = (await Promise.all(activeStays.flatMap((reservation) => {
      const roomId = reservation.stay?.roomId ?? reservation.roomId;
      const room = roomId ? roomById.get(roomId) : undefined;
      if (!room) return [];
      const departureToday = departuresToday.some((departure) => departure.id === reservation.id);
      return [convertFromXaf(reservation.nightlyRate, configuration.currency).then((price) => ({
        id: room.id, number: room.number, floor: room.floor, occupant: reservation.client.name, departureToday, price: price.toFixed(2),
      }))];
    }))).sort((a, b) => a.number.localeCompare(b.number, 'fr', { numeric: true }));
    const occupiedRoomIdsForBoard = new Set(occupiedRooms.map((room) => room.id));
    const vacantRooms = (await Promise.all(roomGroups
      .filter((room) => !occupiedRoomIdsForBoard.has(room.id))
      .map(async ({ id, number, floor, status, active, housekeepingStatus, technicalStatus, nightlyRateMin, nightlyRateMax, category }) => {
        const minimum = await convertFromXaf(nightlyRateMin ?? category.nightlyRate, configuration.currency);
        const maximum = await convertFromXaf(nightlyRateMax ?? category.nightlyRate, configuration.currency);
        return {
          id,
          number,
          floor,
          state: !active || status === 'OUT_OF_SERVICE' || technicalStatus !== 'OPERATIONAL'
            ? 'Indisponible'
            : status === 'AVAILABLE' && housekeepingStatus === 'CLEAN'
              ? 'Prête'
              : 'À préparer',
          priceMin: minimum.toFixed(2),
          priceMax: maximum.toFixed(2),
        };
      }))).sort((a, b) => a.number.localeCompare(b.number, 'fr', { numeric: true }));
    const upcomingLimit = new Date(now.getTime() + 30 * 60_000);
    const siestaAlerts = activeStays
      .filter((reservation) => reservation.stayType === 'SIESTA' && reservation.stay?.expectedCheckOutAt)
      .filter((reservation) => reservation.stay!.expectedCheckOutAt! <= upcomingLimit)
      .map((reservation) => ({
        id: reservation.id,
        reference: reservation.reference,
        client: reservation.client.name,
        room: reservation.room?.number ?? '—',
        expectedCheckOutAt: reservation.stay!.expectedCheckOutAt,
        overdue: reservation.stay!.expectedCheckOutAt! <= now,
      }));
    const personalActionCount = (action: string) => personalEvents.find((item) => item.action === action)?._count._all ?? 0;
    const actorIds = [...new Set(teamEvents.flatMap((event) => event.actorId ? [event.actorId] : []))];
    const actors = actorIds.length
      ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));

    return NextResponse.json({
      today: todayKey,
      period,
      arrivals,
      departures: departuresToday.length,
      pendingReservations,
      confirmedReservations,
      cancelledReservations,
      todayArrivals,
      todayDepartures,
      roomBoard: {
        vacant: vacantRooms,
        occupied: occupiedRooms,
        departures: occupiedRooms.filter((room) => room.departureToday),
      },
      inHouse: activeStays.length,
      rooms: { ...rooms, ...housekeeping, reserved: reservedRoomRows.length },
      stays: {
        siestas: activeStays.filter((reservation) => reservation.stayType === 'SIESTA').length,
        overnights: activeStays.filter((reservation) => reservation.stayType === 'OVERNIGHT').length,
        expiring: siestaAlerts.filter((item) => !item.overdue).length,
        overdueSiestas: siestaAlerts.filter((item) => item.overdue).length,
        siestaAlerts,
      },
      personalActivity: {
        clientsCreated: personalActionCount('RECEPTION_CLIENT_CREATE'),
        reservationsCreated: personalActionCount('RECEPTION_RESERVATION_CREATE'),
        checkIns: personalActionCount('RECEPTION_STAY_CHECK_IN') + personalActionCount('RECEPTION_STAY_CHECK_IN_CORRECTED'),
        checkOuts: personalActionCount('RECEPTION_STAY_CHECK_OUT'),
        payments: personalPayments._count.id,
        amountCollected: personalPayments._sum.amount?.toFixed(2) ?? '0.00',
      },
      teamActivity: teamEvents.map((event) => ({
        id: event.id,
        action: event.action,
        actor: event.actorId ? actorNames.get(event.actorId) ?? 'Compte indisponible' : 'Système',
        createdAt: event.createdAt,
        targetId: event.targetId,
      })),
      pendingPayments: unsettledFolios.length,
      pendingAmount: pendingAmount.toFixed(2),
      unpaidFolios,
      cashSession: cashSession
        ? {
          id: cashSession.id,
          openingAmount: cashSession.openingAmount.toFixed(2),
          openedAt: cashSession.openedAt,
          cashBalance: cashSession.openingAmount.add(
            cashSession.payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0)),
          ).toFixed(2),
        }
        : null,
      paymentMethods,
      permissions: scope.permissions,
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

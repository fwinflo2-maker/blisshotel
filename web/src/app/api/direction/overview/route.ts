import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizedScope, requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { folioTotals, hotelDateKey, parseDateOnly, parseHotelDateTime } from '@/server/reception';

export const instant = false;

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (session.user.platformAdmin || session.user.role?.code !== 'GENERAL_MANAGER') {
      return NextResponse.json({ error: 'Accès réservé au Directeur Général.' }, { status: 403 });
    }
    await authorizedScope('reports.financial.view');

    const configuration = await hotelConfiguration();
    const params = new URL(request.url).searchParams;
    const today = hotelDateKey(new Date(), configuration.timezone);
    const fromText = params.get('from') ?? today;
    const toText = params.get('to') ?? today;
    let fromDate: Date;
    let endDate: Date;
    try {
      fromDate = parseDateOnly(fromText);
      endDate = parseDateOnly(toText);
    } catch (error) {
      if (error instanceof AppError) return NextResponse.json({ error: 'Période invalide.' }, { status: 400 });
      throw error;
    }
    if (fromDate > endDate) return NextResponse.json({ error: 'Période invalide.' }, { status: 400 });
    const from = parseHotelDateTime(`${fromText}T00:00`, configuration.timezone);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const until = parseHotelDateTime(`${endDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);

    const [roomRows, arrivals, departures, activeStayRows, pendingReservations, confirmedReservations, invoices, payments, openFolios, closedCashSessions, openCashSessions, openTasks, shiftReports] = await Promise.all([
      db.room.findMany({ select: { id: true, status: true, housekeepingStatus: true, technicalStatus: true } }),
      db.reservation.count({ where: { checkInDate: { gte: fromDate, lt: endDate }, status: { in: ['PENDING', 'CONFIRMED'] } } }),
      db.reservation.count({ where: { checkOutDate: { gte: fromDate, lt: endDate }, status: 'CHECKED_IN' } }),
      db.stay.findMany({ where: { checkedOutAt: null }, select: { roomId: true } }),
      db.reservation.count({ where: { status: 'PENDING' } }),
      db.reservation.count({ where: { status: 'CONFIRMED' } }),
      db.invoice.aggregate({ where: { issuedAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { totalAmount: true } }),
      db.payment.aggregate({ where: { createdAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { amount: true } }),
      db.folio.findMany({ where: { status: 'OPEN' }, include: { lines: { select: { amount: true } }, payments: { select: { amount: true } } } }),
      db.cashSession.findMany({ where: { status: 'CLOSED', closedAt: { gte: from, lt: until } }, select: { variance: true } }),
      db.cashSession.count({ where: { status: 'OPEN' } }),
      db.housekeepingTask.count({ where: { status: { not: 'COMPLETED' } } }),
      db.receptionShiftReport.count({ where: { startedAt: { gte: from, lt: until } } }),
    ]);
    const rooms = { total: 0, available: 0, occupied: 0, dirty: 0, outOfService: 0 };
    const occupiedRoomIds = new Set(activeStayRows.map((stay) => stay.roomId));
    for (const room of roomRows) {
      rooms.total += 1;
      if (occupiedRoomIds.has(room.id)) {
        rooms.occupied += 1;
        continue;
      }
      const status = room.status === 'OCCUPIED'
        ? (room.housekeepingStatus === 'CLEAN' && room.technicalStatus === 'OPERATIONAL' ? 'AVAILABLE' : 'DIRTY')
        : room.status;
      if (status === 'AVAILABLE') rooms.available += 1;
      if (status === 'DIRTY') rooms.dirty += 1;
      if (status === 'OUT_OF_SERVICE') rooms.outOfService += 1;
    }
    const activeStays = activeStayRows.length;
    const openBalance = openFolios.map(folioTotals).reduce((sum, folio) => sum.add(folio.balance), new Prisma.Decimal(0));
    const cashVariance = closedCashSessions.reduce((sum, session) => sum.add(session.variance ?? 0), new Prisma.Decimal(0));
    return NextResponse.json({
      period: { from: fromText, to: toText },
      rooms,
      operations: { arrivals, departures, activeStays, pendingReservations, confirmedReservations, openCashSessions, openHousekeepingTasks: openTasks, receptionShiftReports: shiftReports },
      finance: {
        invoicesCount: invoices._count.id,
        invoicedAmount: invoices._sum.totalAmount?.toFixed(2) ?? '0.00',
        paymentsCount: payments._count.id,
        collectedAmount: payments._sum.amount?.toFixed(2) ?? '0.00',
        openFolios: openFolios.length,
        outstandingBalance: openBalance.toFixed(2),
        cashVariance: cashVariance.toFixed(2),
        closedCashSessions: closedCashSessions.length,
      },
      alerts: [
        ...(rooms.outOfService ? [`${rooms.outOfService} chambre(s) hors service`] : []),
        ...(rooms.dirty ? [`${rooms.dirty} chambre(s) à remettre en état`] : []),
        ...(openTasks ? [`${openTasks} tâche(s) d’entretien en cours`] : []),
        ...(openBalance.gt(0) ? [`Solde client ouvert : ${openBalance.toFixed(2)} ${configuration.currency}`] : []),
      ],
      currency: configuration.currency,
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

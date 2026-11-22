import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { hotelAdminScope } from '@/server/hotel-admin';
import { AppError } from '@/server/policy';

export async function GET() {
  try {
    const scope = await hotelAdminScope();
    const canViewReservations = scope.permissions.includes('reservations.view');
    const canViewStays = scope.permissions.includes('stays.view');
    if (!canViewReservations && !canViewStays) throw new AppError(403, 'La consultation des réservations ou séjours n’est pas accordée.');
    const reservations = await db.reservation.findMany({
      where: {
        room: { is: { assignedHotelAdminId: scope.userId, active: true } },
        ...(canViewReservations ? {} : { status: 'CHECKED_IN' }),
      },
      orderBy: [{ checkInDate: 'desc' }, { createdAt: 'desc' }], take: 200,
      select: { id: true, reference: true, status: true, stayType: true, checkInDate: true, checkOutDate: true, totalAmount: true, folio: { select: { lines: { select: { amount: true } } } }, room: { select: { id: true, number: true, category: { select: { name: true } } } }, client: { select: { id: true, name: true, phone: true, email: true } } },
    });
    return NextResponse.json({ reservations: reservations.map((reservation) => ({
      id: reservation.id, reference: reservation.reference, status: reservation.status, stayType: reservation.stayType,
      checkInDate: reservation.checkInDate.toISOString().slice(0, 10), checkOutDate: reservation.checkOutDate.toISOString().slice(0, 10),
      totalAmount: scope.permissions.includes('reports.financial.view')
        ? (reservation.folio?.lines.reduce((sum, line) => sum.add(line.amount), new Prisma.Decimal(0)) ?? reservation.totalAmount).toFixed(2)
        : null,
      room: reservation.room ? { id: reservation.room.id, number: reservation.room.number, category: reservation.room.category.name } : null,
      client: {
        id: reservation.client.id,
        name: scope.permissions.includes('clients.view') ? reservation.client.name : '',
        ...(scope.permissions.includes('clients.view') ? { phone: reservation.client.phone, email: reservation.client.email } : {}),
      },
    })) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

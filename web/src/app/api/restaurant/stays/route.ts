import { NextResponse } from 'next/server';
import { scopeFor } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

export async function GET() {
  try {
    const scope = await scopeFor();
    if (!scope.permissions.includes('restaurant.orders.manage') && !scope.permissions.includes('restaurant.folio.transfer')) {
      throw new AppError(403, 'Vous ne pouvez pas consulter les séjours du restaurant.');
    }

    const reservations = await db.reservation.findMany({
      where: { status: 'CHECKED_IN', roomId: { not: null }, stay: { is: { checkedOutAt: null } } },
      include: {
        room: { select: { id: true, number: true } },
        client: { select: { name: true } },
        stay: true,
        folio: { include: { invoice: true, payments: { select: { amount: true } } } },
      },
      orderBy: [{ checkOutDate: 'asc' }],
      take: 200,
    });

    const activeStays = reservations
      .filter((reservation) => {
        if (!reservation.room || reservation.folio?.status !== 'OPEN') return false;
        if (!reservation.folio.invoice) return true;
        const paid = reservation.folio.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        return Number(reservation.folio.invoice.totalAmount) > paid;
      })
      .map((reservation) => ({
        reservationId: reservation.id,
        reference: reservation.reference,
        room: reservation.room!,
        guestName: reservation.client.name,
        nights: Math.max(1, Math.round((reservation.checkOutDate.getTime() - reservation.checkInDate.getTime()) / 86_400_000)),
        checkOutDate: reservation.checkOutDate.toISOString().slice(0, 10),
      }));

    return NextResponse.json({ activeStays });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

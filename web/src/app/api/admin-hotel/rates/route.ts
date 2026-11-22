import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { hotelAdminScope } from '@/server/hotel-admin';
import { AppError } from '@/server/policy';

export async function GET() {
  try {
    const scope = await hotelAdminScope('rooms.rates.view');
    const rooms = await db.room.findMany({
      where: { assignedHotelAdminId: scope.userId, active: true }, orderBy: [{ floor: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, floor: true, nightlyRateMin: true, nightlyRateMax: true, category: { select: { name: true, nightlyRate: true, siestaRate: true } } },
    });
    return NextResponse.json({ rooms: rooms.map((room) => ({
      id: room.id, number: room.number, floor: room.floor, category: room.category.name,
      stayMinimum: room.nightlyRateMin?.toFixed(2) ?? null,
      stayMaximum: room.nightlyRateMax?.toFixed(2) ?? null,
      siestaReference: room.category.siestaRate?.toFixed(2) ?? null,
    })) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

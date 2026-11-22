import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { hotelAdminScope } from '@/server/hotel-admin';
import { AppError } from '@/server/policy';

export async function GET() {
  try {
    const scope = await hotelAdminScope('maintenance.view');
    const rooms = await db.room.findMany({
      where: { assignedHotelAdminId: scope.userId, active: true, OR: [{ technicalStatus: { not: 'OPERATIONAL' } }, { incidents: { some: { status: { not: 'RESOLVED' } } } }] },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, technicalStatus: true, status: true, incidents: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, title: true, description: true, status: true, createdAt: true, updatedAt: true, reportedBy: true } }, statusHistory: { where: { dimension: 'TECHNICAL' }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, previousStatus: true, nextStatus: true, reason: true, source: true, actorId: true, createdAt: true } } },
    });
    return NextResponse.json({ rooms });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

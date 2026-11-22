import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { hotelAdminScope } from '@/server/hotel-admin';
import { AppError } from '@/server/policy';

export async function GET() {
  try {
    const scope = await hotelAdminScope('dashboard.view');
    const events = await db.auditLog.findMany({ where: { actorId: scope.userId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, action: true, result: true, targetId: true, details: true, createdAt: true } });
    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { scopeFor } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

export async function GET() {
  try {
    const scope = await scopeFor();
    if (!['BAR_SERVER', 'RESTAURANT_MANAGER'].includes(scope.roleCode)) throw new AppError(403, 'Cette vue est réservée au personnel du bar-restaurant.');
    const notifications = await db.notification.findMany({ where: { userId: scope.userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json({ notifications: notifications.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), readAt: item.readAt?.toISOString() ?? null })) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

const readSchema = z.object({ id: z.string().min(1) });
export async function PATCH(request: Request) {
  try {
    const scope = await scopeFor();
    if (!['BAR_SERVER', 'RESTAURANT_MANAGER'].includes(scope.roleCode)) throw new AppError(403, 'Cette vue est réservée au personnel du bar-restaurant.');
    const parsed = readSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Notification invalide.' }, { status: 400 });
    const updated = await db.notification.updateMany({ where: { id: parsed.data.id, userId: scope.userId, readAt: null }, data: { readAt: new Date() } });
    if (!updated.count) throw new AppError(404, 'Notification introuvable ou déjà lue.');
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

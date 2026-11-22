import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

export async function GET() {
  try {
    const session = await requireSession();
    if (!session.user.platformAdmin) await authorizedScope('dashboard.view');
    const userId = session.user.id;
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, message: true, readAt: true, createdAt: true },
      }),
      db.notification.count({ where: { userId, readAt: null } }),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

const readSchema = z.object({
  id: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = readSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    const session = await requireSession();
    if (!session.user.platformAdmin) await authorizedScope('dashboard.view');
    const { id, all } = parsed.data;
    if (!id && !all) return NextResponse.json({ error: 'Aucune notification désignée.' }, { status: 400 });
    await db.notification.updateMany({
      where: { userId: session.user.id, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

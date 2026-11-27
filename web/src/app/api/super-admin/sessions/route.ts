import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { platformApi } from '@/server/platform-admin';

export async function GET() {
  return platformApi(async () => {
    const now = new Date();
    const sessions = await db.session.findMany({
      where: { expiresAt: { gt: now }, user: { active: true } },
      orderBy: { createdAt: 'desc' }, take: 500,
      select: { id: true, createdAt: true, expiresAt: true, user: { select: { id: true, name: true, email: true, platformAdmin: true, lastLoginAt: true, role: { select: { code: true, name: true } } } } },
    });
    return NextResponse.json({ sessions: sessions.map((session) => ({ ...session, user: { ...session.user, role: session.user.platformAdmin ? { code: 'SUPER_ADMIN', name: 'Super Administrateur' } : session.user.role } })) });
  });
}

const revokeSchema = z.object({ userId: z.string().min(1) });
export async function DELETE(request: Request) {
  return platformApi(async (actor) => {
    const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Compte cible invalide.' }, { status: 400 });
    const target = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, platformAdmin: true, role: { select: { code: true } } } });
    if (!target) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });
    if (target.platformAdmin) return NextResponse.json({ error: 'Les sessions Super Administrateur ne peuvent pas être révoquées depuis cet écran.' }, { status: 409 });
    if (target.id === actor.id) return NextResponse.json({ error: 'Utilisez la déconnexion pour fermer votre session courante.' }, { status: 409 });
    const revoked = await db.$transaction(async (tx) => {
      const result = await tx.session.deleteMany({ where: { userId: target.id } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'PLATFORM_SESSION_REVOKE_ALL', result: 'SUCCESS', targetId: target.id, details: { sessionsRevoked: result.count } } });
      return result.count;
    });
    return NextResponse.json({ ok: true, sessionsRevoked: revoked });
  });
}

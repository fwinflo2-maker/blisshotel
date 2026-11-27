import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { hashToken } from '@/server/auth';
import { hotelManagementApi } from '@/server/platform-admin';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return hotelManagementApi(async (actor) => {
    const { id } = await params;
    const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true, active: true, platformAdmin: true, role: { select: { code: true } } } });
    if (!user || (!actor.platformAdmin && (user.platformAdmin || user.role?.code === 'OWNER'))) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });
    if (!user.active) return NextResponse.json({ error: 'Réactivez le compte avant de lancer sa récupération d’accès.' }, { status: 409 });

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.$transaction(async (tx) => {
      await tx.resetToken.deleteMany({ where: { userId: user.id } });
      await tx.resetToken.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'PLATFORM_USER_PASSWORD_RESET_REQUEST',
          result: 'SUCCESS',
          targetId: user.id,
          details: { expiresAt: expiresAt.toISOString(), delivery: 'secure_out_of_band' },
        },
      });
    });

    return NextResponse.json({
      resetPath: `/reinitialisation?token=${encodeURIComponent(token)}`,
      expiresAt,
      email: user.email,
    });
  });
}

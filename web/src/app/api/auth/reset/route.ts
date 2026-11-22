import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashToken } from '@/server/auth';
import { db } from '@/server/db';

const schema = z.object({
  token: z.string().length(43),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Le lien ou le mot de passe est invalide.' }, { status: 400 });
  const tokenHash = hashToken(parsed.data.token);
  const now = new Date();
  const available = await db.resetToken.findFirst({ where: { tokenHash, expiresAt: { gt: now } }, select: { tokenHash: true } });
  if (!available) return NextResponse.json({ error: 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.' }, { status: 410 });
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const result = await db.$transaction(async (tx) => {
    const reset = await tx.resetToken.findUnique({ where: { tokenHash } });
    if (!reset || reset.expiresAt <= now) return false;
    const claimed = await tx.resetToken.deleteMany({ where: { tokenHash, expiresAt: { gt: now } } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    await tx.resetToken.deleteMany({ where: { userId: reset.userId } });
    await tx.auditLog.create({
      data: {
        actorId: reset.userId,
        action: 'AUTH_PASSWORD_RESET',
        result: 'SUCCESS',
        targetId: reset.userId,
        details: { completedAt: now.toISOString() },
      },
    });
    return true;
  });
  if (!result) return NextResponse.json({ error: 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.' }, { status: 410 });
  return NextResponse.json({ ok: true });
}

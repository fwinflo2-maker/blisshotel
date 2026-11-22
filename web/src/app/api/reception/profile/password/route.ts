import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const schema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(12).max(128),
});

/** Password change for the signed-in receptionist. All sessions are revoked afterwards. */
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Le nouveau mot de passe doit contenir au moins 12 caractères.' }, { status: 400 });
    }
    const { user } = await requireSession();
    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      await db.auditLog.create({
        data: { actorId: user.id, action: 'PROFILE_PASSWORD_CHANGE', result: 'FAILURE', details: { reason: 'invalid_current_password' } },
      });
      return NextResponse.json({ error: 'Mot de passe actuel incorrect.' }, { status: 403 });
    }
    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return NextResponse.json({ error: 'Le nouveau mot de passe doit être différent de l’actuel.' }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'PROFILE_PASSWORD_CHANGE', result: 'SUCCESS', targetId: user.id, details: { sessions_revoked: true } },
      });
    });
    return NextResponse.json({ ok: true, reauthenticate: true });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

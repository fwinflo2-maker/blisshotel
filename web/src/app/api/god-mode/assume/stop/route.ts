import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { cookieName, cookieOptions, currentSession, hashToken } from '@/server/auth';
import { db } from '@/server/db';
import { AppError } from '@/server/policy';

export const instant = false;
const backupCookie = process.env.NODE_ENV === 'production' ? '__Host-bliss-operator-session' : 'bliss-operator-session';

export async function POST() {
  try {
    const session = await currentSession();
    if (!session?.impersonatedById) throw new AppError(403, 'Aucune session de supervision active.');
    const jar = await cookies();
    const operatorToken = jar.get(backupCookie)?.value;
    if (!operatorToken) throw new AppError(401, 'La session opérateur a expiré. Reconnectez-vous.');
    const operatorSession = await db.session.findUnique({ where: { tokenHash: hashToken(operatorToken) } });
    if (!operatorSession || operatorSession.userId !== session.impersonatedById || operatorSession.expiresAt <= new Date()) {
      throw new AppError(401, 'La session opérateur a expiré. Reconnectez-vous.');
    }
    await db.$transaction(async (tx) => {
      await tx.session.delete({ where: { id: session.id } });
      await tx.auditLog.create({ data: { actorId: operatorSession.userId, action: 'GOD_MODE_SESSION_END', result: 'SUCCESS', targetId: session.userId, details: { sessionId: session.id } } });
    });
    jar.set(cookieName, operatorToken, { ...cookieOptions, expires: operatorSession.expiresAt });
    jar.set(backupCookie, '', { ...cookieOptions, expires: new Date(0) });
    const operator = await db.user.findUnique({ where: { id: operatorSession.userId }, select: { platformAdmin: true, role: { select: { code: true } } } });
    return NextResponse.json({ redirectTo: operator?.platformAdmin ? '/super-admin' : operator?.role?.code === 'OWNER' ? '/proprietaire' : '/direction' });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

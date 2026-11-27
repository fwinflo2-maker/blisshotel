import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { cookieName, cookieOptions, currentSession, hashToken, newToken, requireSession } from '@/server/auth';
import { AppError, canAccessGodMode, canViewGodModeProfile } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;
const backupCookie = process.env.NODE_ENV === 'production' ? '__Host-bliss-operator-session' : 'bliss-operator-session';

const workspacePath = (user: { platformAdmin: boolean; role: { code: string } | null }) => user.platformAdmin ? '/super-admin'
  : user.role?.code === 'OWNER' ? '/proprietaire'
  : user.role?.code === 'GENERAL_MANAGER' ? '/direction'
  : user.role?.code === 'RECEPTIONIST' ? '/reception'
  : user.role?.code === 'HOTEL_ADMIN' ? '/admin-hotel'
  : user.role?.code === 'ACCOUNTANT' ? '/comptabilite'
  : user.role?.code === 'RESTAURANT_MANAGER' ? '/restauration'
  : user.role?.code === 'BAR_SERVER' ? '/bar-service'
  : ['HOUSEKEEPER', 'GOUVERNANTE'].includes(user.role?.code ?? '') ? '/housekeeping'
  : user.role?.code === 'MAINTENANCE_MANAGER' ? '/maintenance' : '/acces-refuse';

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const actor = session.user;
    if (!canAccessGodMode(actor)) throw new AppError(403, 'Accès refusé.');
    if (session.impersonatedById) throw new AppError(409, 'Terminez la session de supervision en cours avant d’en ouvrir une autre.');
    const { userId } = await request.json().catch(() => ({})) as { userId?: string };
    if (!userId) throw new AppError(400, 'Compte cible manquant.');
    const target = await db.user.findUnique({ where: { id: userId }, include: { role: { select: { code: true } } } });
    if (!target || !target.active || !canViewGodModeProfile(actor, { platformAdmin: target.platformAdmin, roleCode: target.role?.code })) {
      throw new AppError(404, 'Compte indisponible pour la supervision.');
    }
    const jar = await cookies();
    const operatorToken = jar.get(cookieName)?.value;
    if (!operatorToken) throw new AppError(401, 'Session opérateur introuvable.');
    const token = newToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.$transaction(async (tx) => {
      await tx.session.create({ data: { tokenHash: hashToken(token), userId: target.id, expiresAt, impersonatedById: actor.id } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'GOD_MODE_SESSION_START', result: 'SUCCESS', targetId: target.id, details: { targetRole: target.role?.code ?? null, expiresAt, readOnly: false } } });
    });
    jar.set(backupCookie, operatorToken, { ...cookieOptions, expires: session.expiresAt });
    jar.set(cookieName, token, { ...cookieOptions, expires: expiresAt });
    return NextResponse.json({ redirectTo: workspacePath(target) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function GET() {
  const session = await currentSession();
  if (!session?.impersonatedById) return NextResponse.json({ impersonating: false });
  const actor = await db.user.findUnique({ where: { id: session.impersonatedById }, select: { id: true, name: true } });
  return NextResponse.json({ impersonating: true, actorName: actor?.name ?? 'Administrateur', targetName: session.user.name });
}

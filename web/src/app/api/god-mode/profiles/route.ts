import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { requireSession } from '@/server/auth';
import { AppError, canAccessGodMode, canViewGodModeProfile } from '@/server/policy';

export const instant = false;

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const actor = session.user;
    if (!canAccessGodMode(actor)) throw new AppError(403, 'Le God Mode est réservé au Super Administrateur, au Propriétaire et au Directeur général.');

    const params = new URL(request.url).searchParams;
    const profileId = params.get('profileId');
    if (profileId) {
      const profile = await db.user.findUnique({
        where: { id: profileId },
        select: {
          id: true,
          name: true,
          active: true,
          platformAdmin: true,
          createdAt: true,
          lastLoginAt: true,
          role: { select: { code: true, name: true, permissions: { select: { permissionCode: true } } } },
          delegatedPermissions: { select: { permissionCode: true } },
        },
      });
      if (!profile || !canViewGodModeProfile(actor, { platformAdmin: profile.platformAdmin, roleCode: profile.role?.code })) {
        return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
      }

      await db.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'GOD_MODE_PROFILE_VIEW',
          result: 'SUCCESS',
          targetId: profile.id,
          details: { roleCode: profile.role?.code ?? null, readOnly: true },
        },
      });
      return NextResponse.json({
        profile: {
          id: profile.id,
          name: profile.name,
          active: profile.active,
          platformAdmin: profile.platformAdmin,
          createdAt: profile.createdAt,
          lastLoginAt: profile.lastLoginAt,
          role: profile.role ? {
            code: profile.role.code,
            name: profile.role.name,
            permissions: profile.role.permissions.map(({ permissionCode }) => permissionCode),
          } : null,
          delegatedPermissions: profile.delegatedPermissions.map(({ permissionCode }) => permissionCode),
        },
      });
    }

    const query = params.get('q')?.trim().slice(0, 100) ?? '';
    const requestedPage = Number(params.get('page'));
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
    const hiddenRoles = actor.platformAdmin ? [] : actor.role?.code === 'GENERAL_MANAGER' ? ['OWNER', 'SUPER_ADMIN'] : ['SUPER_ADMIN'];
    const where = {
      ...(actor.platformAdmin ? {} : { platformAdmin: false }),
      ...(hiddenRoles.length ? { NOT: hiddenRoles.map((code) => ({ role: { is: { code } } })) } : {}),
      ...(query ? {
        OR: [
          { name: { contains: query } },
          { role: { is: { name: { contains: query } } } },
        ],
      } : {}),
    };
    const [total, users] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * 50,
        take: 50,
        select: {
          id: true,
          name: true,
          active: true,
          platformAdmin: true,
          lastLoginAt: true,
          role: { select: { code: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      profiles: users,
      page,
      total,
      pageCount: Math.max(1, Math.ceil(total / 50)),
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { platformApi } from '@/server/platform-admin';

const schema = z.object({ permissionCodes: z.array(z.string().min(1).max(100)).max(100) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return platformApi(async (actor) => {
    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || new Set(parsed.data?.permissionCodes ?? []).size !== parsed.data?.permissionCodes.length) {
      return NextResponse.json({ error: 'Liste de permissions invalide ou dupliquée.' }, { status: 400 });
    }
    const role = await db.role.findUnique({ where: { id } });
    if (!role) return NextResponse.json({ error: 'Rôle introuvable.' }, { status: 404 });
    if (!actor.platformAdmin && (role.code === 'SUPER_ADMIN' || role.code === 'OWNER')) {
      return NextResponse.json({ error: 'Le Super Administrateur seul peut modifier les rôles Super Administrateur ou Propriétaire.' }, { status: 403 });
    }
    if (role.code === 'HOTEL_ADMIN') return NextResponse.json({ error: 'Les accès des Administrateurs Hôtel se règlent individuellement dans « Permissions individuelles ». ' }, { status: 409 });
    if (role.code === 'SUPER_ADMIN') return NextResponse.json({ error: 'Le rôle Super Administrateur est protégé.' }, { status: 409 });
    if (parsed.data.permissionCodes.includes('platform.manage')) {
      return NextResponse.json({ error: 'La permission plateforme ne peut pas être déléguée à un rôle hôtelier.' }, { status: 403 });
    }

    const known = await db.permission.findMany({ where: { code: { in: parsed.data.permissionCodes } }, select: { code: true } });
    if (known.length !== parsed.data.permissionCodes.length) return NextResponse.json({ error: 'Une ou plusieurs permissions sont inconnues.' }, { status: 400 });
    const before = await db.rolePermission.findMany({ where: { roleId: id }, select: { permissionCode: true } });

    await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (parsed.data.permissionCodes.length) {
        await tx.rolePermission.createMany({
          data: parsed.data.permissionCodes.map((permissionCode) => ({ roleId: id, permissionCode })),
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'PLATFORM_ROLE_PERMISSIONS_UPDATE',
          result: 'SUCCESS',
          targetId: id,
          details: {
            roleCode: role.code,
            before: before.map((permission) => permission.permissionCode),
            after: parsed.data.permissionCodes,
          },
        },
      });
    });
    return NextResponse.json({ ok: true });
  });
}

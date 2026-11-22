import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hotelAdminDelegablePermissions } from '@/features/access/catalog';
import { db } from '@/server/db';
import { platformApi } from '@/server/platform-admin';
import { assertRoomAssignmentManager } from '@/server/policy';

export const instant = false;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return platformApi(async (actor) => {
    assertRoomAssignmentManager(actor);
    const { id } = await params;
    const user = await db.user.findFirst({ where: { id, role: { code: 'HOTEL_ADMIN' } }, select: { id: true, name: true, email: true, delegatedPermissions: { select: { permissionCode: true } } } });
    if (!user) return NextResponse.json({ error: 'Compte Administrateur Hôtel introuvable.' }, { status: 404 });
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email }, permissions: user.delegatedPermissions.map((item) => item.permissionCode), available: hotelAdminDelegablePermissions });
  });
}

const schema = z.object({ permissionCodes: z.array(z.enum(hotelAdminDelegablePermissions)).max(hotelAdminDelegablePermissions.length) });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return platformApi(async (actor) => {
    assertRoomAssignmentManager(actor);
    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'La liste des permissions est invalide.' }, { status: 400 });
    }
    if (new Set(parsed.data.permissionCodes).size !== parsed.data.permissionCodes.length) return NextResponse.json({ error: 'Une permission ne peut apparaître qu’une fois.' }, { status: 400 });
    const user = await db.user.findFirst({ where: { id, role: { code: 'HOTEL_ADMIN' } }, select: { id: true } });
    if (!user) return NextResponse.json({ error: 'Compte Administrateur Hôtel introuvable.' }, { status: 404 });
    const previous = await db.userPermission.findMany({ where: { userId: id }, select: { permissionCode: true } });
    await db.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId: id } });
      if (parsed.data.permissionCodes.length) await tx.userPermission.createMany({ data: parsed.data.permissionCodes.map((permissionCode) => ({ userId: id, permissionCode, grantedById: actor.id })) });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'HOTEL_ADMIN_PERMISSIONS_UPDATED', result: 'SUCCESS', targetId: id, details: { before: previous.map((item) => item.permissionCode), after: parsed.data.permissionCodes } } });
    });
    return NextResponse.json({ permissionCodes: parsed.data.permissionCodes });
  });
}

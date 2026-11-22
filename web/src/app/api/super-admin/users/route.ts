import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { platformApi } from '@/server/platform-admin';

export async function GET(request: Request) {
  return platformApi(async (actor) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim() ?? '';
    const users = await db.user.findMany({
      where: {
        ...(actor.platformAdmin ? {} : { platformAdmin: false, role: { isNot: { code: 'OWNER' } } }),
        ...(query ? {
          OR: [
            { email: { contains: query } },
            { name: { contains: query } },
            { role: { name: { contains: query } } },
          ],
        } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        platformAdmin: true,
        lastLoginAt: true,
        createdAt: true,
        role: { select: { code: true, name: true } },
      },
    });
    return NextResponse.json({ users });
  });
}

const updateSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().max(191).optional(),
  roleId: z.string().min(1).nullable().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(191),
  password: z.string().min(12).max(128),
  roleCode: z.string().trim().min(1).max(40),
});

/** Creates an individual account (never shared). One identifier per receptionist. */
export async function POST(request: Request) {
  return platformApi(async (actor) => {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Nom, e-mail, mot de passe (12 caractères minimum) ou rôle invalide.' }, { status: 400 });
    const { name, email, password, roleCode } = parsed.data;
    const role = await db.role.findFirst({ where: { code: roleCode }, select: { id: true, code: true, name: true } });
    if (!role || role.code === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Rôle invalide pour un compte hôtelier.' }, { status: 400 });
    }
    if (!actor.platformAdmin && role.code === 'OWNER') {
      return NextResponse.json({ error: 'Seul le Super Administrateur peut créer un compte Propriétaire.' }, { status: 403 });
    }
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
    if (existing) return NextResponse.json({ error: 'Un compte utilise déjà cette adresse e-mail.' }, { status: 409 });
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email: email.toLowerCase(), passwordHash, roleId: role.id, active: true },
        select: { id: true, email: true, name: true, active: true, platformAdmin: true, lastLoginAt: true, createdAt: true, role: { select: { code: true, name: true } } },
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: 'PLATFORM_USER_CREATE', result: 'SUCCESS', targetId: created.id, details: { roleCode: role.code, email: created.email } },
      });
      return created;
    });
    return NextResponse.json({ user }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return platformApi(async (actor) => {
    const parsed = updateSchema.extend({ userId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Modification de compte invalide.' }, { status: 400 });
    const { userId, active, name, email, roleId } = parsed.data;
    if (active === undefined && name === undefined && email === undefined && roleId === undefined) return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 });
    if (roleId) {
      const role = await db.role.findUnique({ where: { id: roleId }, select: { code: true } });
      if (!role || role.code === 'SUPER_ADMIN' || (!actor.platformAdmin && role.code === 'OWNER')) {
        return NextResponse.json({ error: 'Rôle invalide pour un compte hôtelier.' }, { status: 400 });
      }
    }
    if (email !== undefined) {
      const existingEmail = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
      if (existingEmail && existingEmail.id !== userId) {
        return NextResponse.json({ error: 'Un autre compte utilise déjà cette adresse e-mail.' }, { status: 409 });
      }
    }
    if (userId === actor.id && active === false) return NextResponse.json({ error: 'Vous ne pouvez pas suspendre votre propre compte.' }, { status: 409 });
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, active: true, platformAdmin: true, roleId: true, role: { select: { code: true } } } });
    if (!target || (!actor.platformAdmin && (target.platformAdmin || target.role?.code === 'OWNER'))) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });
    if (target.platformAdmin && (name !== undefined || email !== undefined || roleId !== undefined)) return NextResponse.json({ error: 'Le profil Super Administrateur se gère uniquement par le compte de bootstrap.' }, { status: 409 });
    if (target.platformAdmin && active === false) {
      const activeAdmins = await db.user.count({ where: { platformAdmin: true, active: true } });
      if (activeAdmins <= 1) return NextResponse.json({ error: 'Le dernier Super Administrateur actif ne peut pas être suspendu.' }, { status: 409 });
    }

    const user = await db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(active !== undefined ? { active } : {}),
          ...(name !== undefined ? { name } : {}),
          ...(email !== undefined ? { email: email.toLowerCase() } : {}),
          ...(roleId !== undefined ? { roleId } : {}),
        },
        select: { id: true, email: true, name: true, active: true, platformAdmin: true, lastLoginAt: true, createdAt: true, roleId: true, role: { select: { code: true, name: true } } },
      });
      if (roleId !== undefined && roleId !== null || email !== undefined) {
        await tx.session.deleteMany({ where: { userId } });
      }
      if (roleId !== undefined && updated.role?.code !== 'HOTEL_ADMIN') {
        await tx.userPermission.deleteMany({ where: { userId } });
      }
      if (active === false) {
        await tx.session.deleteMany({ where: { userId } });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: active !== undefined ? (active ? 'PLATFORM_USER_REACTIVATE' : 'PLATFORM_USER_SUSPEND') : 'PLATFORM_USER_UPDATE',
          result: 'SUCCESS',
          targetId: target.id,
          details: {
            before: { active: target.active, name: target.name, email: target.email, roleId: target.roleId },
            after: { active: updated.active, name: updated.name, email: updated.email, roleId: updated.roleId },
          },
        },
      });
      return updated;
    });
    return NextResponse.json({ user });
  });
}

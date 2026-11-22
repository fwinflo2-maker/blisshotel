import 'server-only';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db';
import type { Prisma } from '@prisma/client';
import { AppError, assertPermission, assertPlatformAccess, roomAssignmentFilter, type Scope } from './policy';
import { hotelAdminDelegablePermissions, permissionsWithEnabledFeatures, type PermissionCode } from '@/features/access/catalog';
export const cookieName = process.env.NODE_ENV === 'production' ? '__Host-bliss-session' : 'bliss-session';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
export async function currentSession() {
  await connection();
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || token.length !== 43) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { role: { include: { permissions: true } } } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session;
}
export async function requireSession() {
  const session = await currentSession();
  if (!session) throw new AppError(401, 'Veuillez vous connecter.');
  return session;
}
export async function pageSession() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  return session;
}
export async function scopeFor(): Promise<Scope> {
  const { user } = await requireSession();
  if (!user.role) throw new AppError(403, 'Aucun rôle hôtelier n’est attribué à ce compte.');
  const disabledFeatures = db.platformFeature ? await db.platformFeature.findMany({ where: { enabled: false }, select: { key: true } }) : [];
  const isHotelAdmin = user.role.code === 'HOTEL_ADMIN';
  const directPermissions = isHotelAdmin
    ? await db.userPermission.findMany({ where: { userId: user.id, permissionCode: { in: [...hotelAdminDelegablePermissions] } }, select: { permissionCode: true } })
    : [];
  const rolePermissions = user.role.permissions.map((permission) => permission.permissionCode);
  return {
    userId: user.id,
    name: user.name,
    roleCode: user.role.code,
    permissions: permissionsWithEnabledFeatures([
      ...(isHotelAdmin ? rolePermissions.filter((code) => code === 'dashboard.view' || code === 'rooms.view') : rolePermissions),
      ...directPermissions.map((permission) => permission.permissionCode),
    ], new Set(disabledFeatures.map((feature) => feature.key))),
  };
}
export function roomAssignmentWhere(scope: Scope): Prisma.RoomWhereInput {
  return roomAssignmentFilter(scope.roleCode, scope.userId);
}
export async function assertAssignedRoom(scope: Scope, roomId: string) {
  if (scope.roleCode !== 'HOTEL_ADMIN') return;
  const room = await db.room.findFirst({ where: { id: roomId, assignedHotelAdminId: scope.userId }, select: { id: true } });
  if (!room) throw new AppError(404, 'Chambre introuvable dans votre espace « Mes chambres ».');
}
export async function authorizedScope(permission: PermissionCode): Promise<Scope> {
  const scope = await scopeFor();
  assertPermission(scope, permission);
  return scope;
}
export async function pageScope(permission: PermissionCode) {
  await pageSession();
  try { return await authorizedScope(permission); } catch (error) { if (error instanceof AppError) redirect('/acces-refuse'); throw error; }
}
export async function requirePlatform() {
  const session = await requireSession();
  assertPlatformAccess(session.user);
  return session.user;
}

export async function platformPageSession() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  if (!session.user.platformAdmin) redirect('/acces-refuse');
  return session;
}

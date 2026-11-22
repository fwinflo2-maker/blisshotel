import type { PermissionCode } from '@/features/access/catalog';
export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function assertPlatformAccess(user: { platformAdmin: boolean }) {
  if (!user.platformAdmin) throw new AppError(403, 'Administration plateforme uniquement.');
}
export function assertRoomAssignmentManager(user: { platformAdmin: boolean; role?: { code: string } | null }) {
  if (!user.platformAdmin && user.role?.code !== 'OWNER') {
    throw new AppError(403, 'Seul le Propriétaire ou le Super Administrateur peut modifier les attributions de chambres.');
  }
}
export function roomAssignmentFilter(roleCode: string | undefined, userId: string) {
  return roleCode === 'HOTEL_ADMIN' ? { assignedHotelAdminId: userId } : {};
}
export type Scope = { userId: string; name: string; permissions: string[]; roleCode?: string };
export function assertPermission(scope: Scope, permission: PermissionCode) {
  if (!scope.permissions.includes(permission)) throw new AppError(403, 'Accès refusé à cette opération.');
}
export function assertOwnCashSession(scope: Scope, session: { userId: string }) {
  if (scope.userId !== session.userId) throw new AppError(403, 'Cette session de caisse ne vous appartient pas.');
}
export function assertDelegation(scope: Scope, permissions: string[]) {
  if (permissions.some(p => p === 'platform.manage' || !scope.permissions.includes(p))) throw new AppError(403, 'Vous ne pouvez pas déléguer des droits que vous ne possédez pas.');
}

export type GodModeActor = { platformAdmin: boolean; role?: { code: string } | null };
export type GodModeProfile = { platformAdmin: boolean; roleCode?: string | null };

export function canAccessGodMode(actor: GodModeActor) {
  return actor.platformAdmin || ['OWNER', 'GENERAL_MANAGER'].includes(actor.role?.code ?? '');
}

export function canViewGodModeProfile(actor: GodModeActor, profile: GodModeProfile) {
  if (!canAccessGodMode(actor)) return false;
  if (actor.platformAdmin) return true;
  if (profile.platformAdmin || profile.roleCode === 'SUPER_ADMIN') return false;
  return actor.role?.code !== 'GENERAL_MANAGER' || profile.roleCode !== 'OWNER';
}

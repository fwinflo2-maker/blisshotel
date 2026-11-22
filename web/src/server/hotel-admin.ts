import 'server-only';
import type { PermissionCode } from '@/features/access/catalog';
import { requireSession, scopeFor } from './auth';
import { AppError, assertPermission, type Scope } from './policy';

export async function hotelAdminScope(permission?: PermissionCode): Promise<Scope> {
  const session = await requireSession();
  if (session.user.role?.code !== 'HOTEL_ADMIN') throw new AppError(403, 'Espace réservé aux Administrateurs Hôtel.');
  const scope = await scopeFor();
  if (permission) assertPermission(scope, permission);
  return scope;
}

export function adminRoomWhere(scope: Scope) {
  return { assignedHotelAdminId: scope.userId, active: true };
}

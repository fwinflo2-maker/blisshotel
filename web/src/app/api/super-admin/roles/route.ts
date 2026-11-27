import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { hotelManagementApi } from '@/server/platform-admin';

export async function GET() {
  return hotelManagementApi(async (actor) => {
    const [roles, permissions] = await Promise.all([
      db.role.findMany({
        where: actor.platformAdmin ? {} : { code: { notIn: ['SUPER_ADMIN', 'OWNER'] } },
        orderBy: [{ optional: 'asc' }, { name: 'asc' }],
        include: { permissions: { select: { permissionCode: true } }, _count: { select: { users: true } } },
      }),
      db.permission.findMany({ where: actor.platformAdmin ? {} : { code: { not: 'platform.manage' } }, orderBy: [{ group: 'asc' }, { code: 'asc' }] }),
    ]);
    return NextResponse.json({
      roles: roles.map((role) => ({
        ...role,
        permissions: role.permissions.map((permission) => permission.permissionCode).filter((code) =>
          role.code !== 'BAR_SERVER' || !['restaurant.menu.manage', 'restaurant.stock.manage'].includes(code),
        ),
      })),
      permissions,
    });
  });
}

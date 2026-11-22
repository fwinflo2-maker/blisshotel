import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { platformApi } from '@/server/platform-admin';
import { assertRoomAssignmentManager } from '@/server/policy';

export const instant = false;

export async function GET() {
  return platformApi(async (actor) => {
    assertRoomAssignmentManager(actor);
    const administrators = await db.user.findMany({
      where: { role: { code: 'HOTEL_ADMIN' } }, orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, active: true, _count: { select: { managedRooms: true, delegatedPermissions: true } } },
    });
    return NextResponse.json({ administrators: administrators.map(({ _count, ...user }) => ({ ...user, roomCount: _count.managedRooms, delegatedPermissionCount: _count.delegatedPermissions })) });
  });
}

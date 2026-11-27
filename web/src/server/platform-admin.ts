import 'server-only';
import { NextResponse } from 'next/server';
import { AppError, assertPlatformAdmin } from './policy';
import { requireSession } from './auth';

type PlatformActor = Awaited<ReturnType<typeof requireSession>>['user'];

export async function platformApi(
  handler: (actor: PlatformActor) => Promise<Response>,
) {
  try {
    const session = await requireSession();
    assertPlatformAdmin(session.user);
    return await handler(session.user);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/** Shared hotel-management APIs retained for OWNER and SUPER_ADMIN with endpoint-level restrictions. */
export async function hotelManagementApi(
  handler: (actor: PlatformActor) => Promise<Response>,
) {
  try {
    const session = await requireSession();
    if (!session.user.platformAdmin && session.user.role?.code !== 'OWNER') throw new AppError(403, 'Accès réservé au Propriétaire ou au Super Administrateur.');
    return await handler(session.user);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

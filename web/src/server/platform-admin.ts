import 'server-only';
import { NextResponse } from 'next/server';
import { AppError } from './policy';
import { requireSession } from './auth';

type PlatformActor = Awaited<ReturnType<typeof requireSession>>['user'];

export async function platformApi(
  handler: (actor: PlatformActor) => Promise<Response>,
) {
  try {
    const session = await requireSession();
    if (!session.user.platformAdmin && session.user.role?.code !== 'OWNER') {
      throw new AppError(403, 'Accès réservé au Super Administrateur ou au Propriétaire de BLISS HOTEL.');
    }
    const actor = session.user;
    return await handler(actor);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

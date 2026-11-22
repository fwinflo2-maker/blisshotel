import { NextResponse } from 'next/server';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { findPossibleClientDuplicates } from '@/server/client-matching';
import { db } from '@/server/db';
import { clientSchema } from '../route';

export const instant = false;

export async function POST(request: Request) {
  try {
    const parsed = clientSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Vérifiez les coordonnées du client.' }, { status: 400 });
    await authorizedScope('clients.create');
    await authorizedScope('clients.view');
    const possibleDuplicates = await findPossibleClientDuplicates(db, parsed.data);
    return NextResponse.json({ possibleDuplicates });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

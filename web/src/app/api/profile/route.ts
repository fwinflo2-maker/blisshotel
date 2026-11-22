import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const part = z.string().trim().min(1).max(78).regex(/^[^\d<>@#$%^*_=+{}[\]\|~`]+$/u);
const schema = z.object({ firstName: part, lastName: part });

/** Only the platform super-admin and hotel owner can change a user's name. */
export async function PATCH(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Renseignez un prénom et un nom valides (sans chiffres ni symboles).' }, { status: 400 });
    const { user } = await requireSession();
    if (!user.platformAdmin && user.role?.code !== 'OWNER') {
      return NextResponse.json({ error: 'Seul le Super Administrateur ou le Propriétaire peut modifier un nom et un prénom.' }, { status: 403 });
    }
    const name = `${parsed.data.firstName.replace(/\s+/g, ' ')} ${parsed.data.lastName.replace(/\s+/g, ' ')}`;
    if (name === user.name) return NextResponse.json({ ok: true, name });
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { name } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'PROFILE_NAME_CHANGE', result: 'SUCCESS', targetId: user.id, details: { previous: user.name, next: name } },
      });
    });
    return NextResponse.json({ ok: true, name });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

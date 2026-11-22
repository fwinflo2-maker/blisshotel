import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope, requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(191),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const roleCode = session.user.role?.code;
    if (!session.user.platformAdmin) {
      if (roleCode === 'GOUVERNANTE') {
        await authorizedScope('housekeeping.agents.manage');
      } else if (roleCode === 'HOTEL_ADMIN' || roleCode === 'OWNER') {
        await authorizedScope('users.manage');
      } else {
        throw new AppError(403, 'Seuls la Gouvernante, l’Administrateur Hôtel, le Propriétaire et le Super Administrateur peuvent créer un Agent d’entretien.');
      }
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Nom, adresse e-mail et mot de passe de 12 caractères minimum requis.' }, { status: 400 });
    }

    const role = await db.role.findFirst({
      where: { code: 'HOUSEKEEPER' },
      select: { id: true, code: true, name: true },
    });
    if (!role) throw new AppError(500, 'Le rôle Agent d’entretien n’est pas configuré.');

    const email = parsed.data.email.toLowerCase();
    if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
      return NextResponse.json({ error: 'Un compte utilise déjà cette adresse e-mail.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: parsed.data.name,
          email,
          passwordHash,
          roleId: role.id,
          active: true,
        },
        select: { id: true, name: true, email: true, active: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          action: 'HOUSEKEEPING_AGENT_CREATE',
          result: 'SUCCESS',
          targetId: created.id,
          details: { email: created.email, roleCode: role.code },
        },
      });
      return created;
    });

    return NextResponse.json({ agent: user }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Un compte utilise déjà cette adresse e-mail.' }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['45028', 'P2024', 'P1001', 'P1002'].includes(error.code)) {
      return NextResponse.json({ error: 'La base de données est indisponible. Vérifiez qu’elle est démarrée, puis réessayez.' }, { status: 503 });
    }
    const diagnostic = error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : error instanceof Error ? error.name : 'erreur inconnue';
    console.error('Échec de création du compte Agent d’entretien :', diagnostic);
    return NextResponse.json({ error: 'Le serveur n’a pas pu créer ce compte. Réessayez dans un instant.' }, { status: 500 });
  }
}

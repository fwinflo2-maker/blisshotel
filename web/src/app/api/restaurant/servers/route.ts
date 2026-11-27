import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(191),
  password: z.string().min(12).max(128),
});

function assertRestaurantManager(roleCode: string | undefined) {
  if (roleCode !== 'RESTAURANT_MANAGER') {
    throw new AppError(403, 'Seule la responsable Bar & Restaurant peut gérer les comptes des serveuses.');
  }
}

export async function GET() {
  try {
    const scope = await authorizedScope('restaurant.orders.manage');
    assertRestaurantManager(scope.roleCode);
    const users = await db.user.findMany({
      where: { role: { is: { code: 'BAR_SERVER' } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, active: true, createdAt: true },
    });
    return NextResponse.json({ users });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const scope = await authorizedScope('restaurant.orders.manage');
    assertRestaurantManager(scope.roleCode);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Indiquez un nom, une adresse e-mail et un mot de passe de 12 caractères minimum.' }, { status: 400 });
    }

    const { name, password } = parsed.data;
    const email = parsed.data.email.toLowerCase();
    if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
      return NextResponse.json({ error: 'Un compte utilise déjà cette adresse e-mail.' }, { status: 409 });
    }
    const role = await db.role.findFirst({ where: { code: 'BAR_SERVER' }, select: { id: true } });
    if (!role) throw new AppError(503, 'Le rôle Serveuse du bar n’est pas configuré.');

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email, passwordHash, roleId: role.id, active: true },
        select: { id: true, name: true, email: true, active: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RESTAURANT_SERVER_CREATE',
          result: 'SUCCESS',
          targetId: created.id,
          details: { email: created.email },
        },
      });
      return created;
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

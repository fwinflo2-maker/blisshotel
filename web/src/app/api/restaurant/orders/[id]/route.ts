import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { presentRestaurantOrder, restaurantOrderInclude } from '@/server/restaurant';

export const instant = false;

const statusSchema = z.object({ status: z.enum(['PREPARING', 'READY', 'SERVED']) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await authorizedScope('restaurant.orders.manage');
    const parsed = statusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'État de commande invalide.' }, { status: 400 });
    const { id } = await params;
    const updated = await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM RestaurantOrder WHERE id = ${id} FOR UPDATE`;
      const before = await tx.restaurantOrder.findUnique({ where: { id } });
      if (!before) throw new AppError(404, 'Commande restaurant introuvable.');
      const allowed = before.status === 'CONFIRMED' && parsed.data.status === 'PREPARING'
        || before.status === 'PREPARING' && parsed.data.status === 'READY'
        || before.status === 'READY' && parsed.data.status === 'SERVED';
      if (!allowed) throw new AppError(409, 'Cette étape ne suit pas l’état actuel de la commande.');
      const now = new Date();
      const order = await tx.restaurantOrder.update({
        where: { id },
        data: {
          status: parsed.data.status,
          ...(parsed.data.status === 'PREPARING' ? { preparedAt: now } : {}),
          ...(parsed.data.status === 'READY' ? { readyAt: now } : {}),
          ...(parsed.data.status === 'SERVED' ? { servedAt: now } : {}),
        },
        include: restaurantOrderInclude,
      });
      await tx.auditLog.create({
        data: { actorId: scope.userId, action: `RESTAURANT_ORDER_${parsed.data.status}`, result: 'SUCCESS', targetId: id, details: { number: before.number, before: before.status, after: order.status } },
      });
      return order;
    });
    return NextResponse.json({ order: presentRestaurantOrder(updated) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

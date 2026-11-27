import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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
    if (scope.roleCode !== 'BAR_SERVER') throw new AppError(403, 'Le traitement des commandes est réservé aux serveuses.');
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
      if (parsed.data.status === 'SERVED') {
        const orderWithLines = await tx.restaurantOrder.findUniqueOrThrow({
          where: { id },
          include: { lines: { select: { menuItemId: true, quantity: true } } },
        });
        const consumption = new Map<string, Prisma.Decimal>();
        for (const line of orderWithLines.lines) {
          if (!line.menuItemId) continue;
          consumption.set(line.menuItemId, (consumption.get(line.menuItemId) ?? new Prisma.Decimal(0)).add(line.quantity));
        }
        for (const [menuItemId, quantity] of [...consumption.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM RestaurantMenuItem WHERE id = ${menuItemId} FOR UPDATE`;
          const item = await tx.restaurantMenuItem.findUnique({ where: { id: menuItemId } });
          if (!item || item.stockQuantity === null) continue;
          const nextQuantity = item.stockQuantity.sub(quantity);
          if (nextQuantity.lt(0)) throw new AppError(409, `Stock insuffisant pour ${item.name}.`);
          await tx.restaurantMenuItem.update({ where: { id: item.id }, data: { stockQuantity: nextQuantity } });
          await tx.restaurantStockMovement.create({ data: {
            menuItemId: item.id,
            type: 'SALE',
            quantity,
            previousQuantity: item.stockQuantity,
            resultingQuantity: nextQuantity,
            reference: before.number,
            createdBy: scope.userId,
            createdByName: scope.name,
          } });
        }
      }
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
      if (parsed.data.status === 'READY' && before.createdBy !== scope.userId) {
        await tx.notification.create({ data: { userId: before.createdBy, message: `La commande ${before.number} est prête à être servie.` } });
      }
      return order;
    });
    return NextResponse.json({ order: presentRestaurantOrder(updated) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

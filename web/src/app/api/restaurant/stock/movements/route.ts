import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { scopeFor } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const movementSchema = z.object({
  menuItemId: z.string().min(1),
  type: z.enum(['SUPPLY', 'LOSS', 'INTERNAL_USE', 'ADJUSTMENT']),
  quantity: z.coerce.number().finite().positive().max(1000000),
  note: z.string().trim().max(500).optional(),
  reference: z.string().trim().max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const scope = await scopeFor();
    if (!scope.permissions.some((permission) => ['restaurant.stock.view', 'restaurant.stock.count', 'restaurant.stock.manage', 'restaurant.menu.manage', 'restaurant.orders.manage', 'restaurant.reports.view'].includes(permission))) {
      throw new AppError(403, 'Vous ne pouvez pas consulter les mouvements de stock.');
    }
    const menuItemId = new URL(request.url).searchParams.get('menuItemId');
    const movements = await db.restaurantStockMovement.findMany({
      where: menuItemId ? { menuItemId } : {},
      include: { menuItem: { select: { id: true, name: true, stockUnit: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json({ movements: movements.map((movement) => ({
      ...movement,
      quantity: movement.quantity.toFixed(2),
      previousQuantity: movement.previousQuantity?.toFixed(2) ?? null,
      resultingQuantity: movement.resultingQuantity?.toFixed(2) ?? null,
      createdAt: movement.createdAt.toISOString(),
    })) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const scope = await scopeFor();
    if (scope.roleCode === 'BAR_SERVER' || (!scope.permissions.includes('restaurant.stock.manage') && scope.roleCode !== 'RESTAURANT_MANAGER')) {
      throw new AppError(403, 'Seule la responsable peut enregistrer des mouvements de stock.');
    }
    const parsed = movementSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Vérifiez le produit, le mouvement et la quantité.' }, { status: 400 });
    const { menuItemId, type, quantity, note, reference } = parsed.data;
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM RestaurantMenuItem WHERE id = ${menuItemId} FOR UPDATE`;
      const item = await tx.restaurantMenuItem.findUnique({ where: { id: menuItemId } });
      if (!item || item.deletedAt) throw new AppError(404, 'Produit introuvable.');
      const amount = new Prisma.Decimal(quantity);
      const previous = item.stockQuantity;
      if (previous === null && type !== 'SUPPLY') throw new AppError(409, 'Enregistrez d’abord le stock initial par inventaire ou approvisionnement.');
      let resulting: Prisma.Decimal;
      if (previous === null || type === 'ADJUSTMENT') resulting = amount;
      else if (type === 'SUPPLY') resulting = previous.add(amount);
      else resulting = previous.sub(amount);
      if (resulting.lt(0)) throw new AppError(409, 'Ce mouvement ferait passer le stock sous zéro.');

      const defaultUnit = ['DRINK', 'SOFT_DRINK', 'JUICE', 'WATER', 'BEER', 'WINE', 'WHISKY', 'SPIRIT', 'COCKTAIL'].includes(item.category) ? 'bouteille(s)' : 'unité(s)';
      const updated = await tx.restaurantMenuItem.update({ where: { id: item.id }, data: { stockQuantity: resulting, ...(item.stockUnit === null ? { stockUnit: defaultUnit } : {}) } });
      const movement = await tx.restaurantStockMovement.create({ data: {
        menuItemId: item.id,
        type,
        quantity: type === 'ADJUSTMENT' && previous !== null ? resulting.sub(previous).abs() : amount,
        previousQuantity: previous,
        resultingQuantity: resulting,
        reference: reference || null,
        note: note || null,
        createdBy: scope.userId,
        createdByName: scope.name,
      } });
      await tx.auditLog.create({ data: {
        actorId: scope.userId,
        action: `RESTAURANT_STOCK_${type}`,
        result: 'SUCCESS',
        targetId: item.id,
        details: { item: item.name, previous: previous?.toFixed(2) ?? null, resulting: resulting.toFixed(2), quantity: movement.quantity.toFixed(2), note: note ?? null, reference: reference ?? null },
      } });
      return { item: updated, movement };
    });
    return NextResponse.json({
      item: { id: result.item.id, name: result.item.name, stockQuantity: result.item.stockQuantity?.toFixed(2), stockUnit: result.item.stockUnit },
      movement: { id: result.movement.id, type: result.movement.type, quantity: result.movement.quantity.toFixed(2), previousQuantity: result.movement.previousQuantity?.toFixed(2), resultingQuantity: result.movement.resultingQuantity?.toFixed(2), createdAt: result.movement.createdAt.toISOString() },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

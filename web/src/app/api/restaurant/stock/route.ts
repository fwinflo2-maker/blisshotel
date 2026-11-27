import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { scopeFor } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { hotelDateKey, parseDateOnly, parseHotelDateTime } from '@/server/reception';

export const instant = false;

export async function GET() {
  try {
    const scope = await scopeFor();
    if (!scope.permissions.some((permission) => ['restaurant.stock.view', 'restaurant.stock.count', 'restaurant.stock.manage', 'restaurant.menu.manage', 'restaurant.reports.view', 'restaurant.orders.manage'].includes(permission))) {
      throw new AppError(403, 'Vous ne pouvez pas consulter les stocks du restaurant.');
    }
    const configuration = await hotelConfiguration();
    const today = hotelDateKey(new Date(), configuration.timezone);
    const nextDate = parseDateOnly(today);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const from = parseHotelDateTime(`${today}T00:00`, configuration.timezone);
    const until = parseHotelDateTime(`${nextDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    const [items, todayCounts] = await Promise.all([
      db.restaurantMenuItem.findMany({ where: { deletedAt: null }, orderBy: [{ category: 'asc' }, { name: 'asc' }], include: { stockCounts: { orderBy: { createdAt: 'desc' }, take: 1 } } }),
      db.restaurantStockCount.findMany({ where: { createdAt: { gte: from, lt: until } }, orderBy: { createdAt: 'desc' }, select: { menuItemId: true, countedQuantity: true, previousQuantity: true, countedByName: true, createdAt: true, note: true } }),
    ]);
    const todayCountByItem = new Map<string, typeof todayCounts[number]>();
    for (const count of todayCounts) if (!todayCountByItem.has(count.menuItemId)) todayCountByItem.set(count.menuItemId, count);
    return NextResponse.json({ date: today, items: items.map(({ stockCounts, ...item }) => {
      const todayCount = todayCountByItem.get(item.id);
      const lastCount = stockCounts[0];
      const serializeCount = (count: { countedQuantity: Prisma.Decimal; previousQuantity: Prisma.Decimal | null; countedByName: string; createdAt: Date; note: string | null }) => ({ quantity: count.countedQuantity.toFixed(2), previousQuantity: count.previousQuantity?.toFixed(2) ?? null, countedBy: count.countedByName, createdAt: count.createdAt.toISOString(), note: count.note });
      return { ...item, price: item.price.toFixed(2), stockQuantity: item.stockQuantity?.toFixed(2) ?? null, stockAlertAt: item.stockAlertAt?.toFixed(2) ?? null, lastCount: lastCount ? serializeCount(lastCount) : null, todayCount: todayCount ? serializeCount(todayCount) : null };
    }) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

const countSchema = z.object({ menuItemId: z.string().min(1), quantity: z.coerce.number().finite().min(0).max(1000000), unit: z.string().trim().min(1).max(30).optional(), alertAt: z.coerce.number().finite().min(0).max(1000000).optional(), note: z.string().trim().max(500).optional() });

export async function POST(request: Request) {
  try {
    const scope = await scopeFor();
    if (!scope.permissions.some((permission) => ['restaurant.stock.count', 'restaurant.stock.manage'].includes(permission)) && !['BAR_SERVER', 'RESTAURANT_MANAGER'].includes(scope.roleCode ?? '')) {
      throw new AppError(403, 'Vous ne pouvez pas effectuer un inventaire du restaurant.');
    }
    const parsed = countSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Vérifiez le produit, la quantité et l’unité.' }, { status: 400 });
    const { menuItemId, quantity, unit, alertAt, note } = parsed.data;
    const canConfigureStock = scope.roleCode !== 'BAR_SERVER' && scope.permissions.some((permission) => ['restaurant.stock.manage', 'restaurant.menu.manage'].includes(permission));
    if (!canConfigureStock && (unit !== undefined || alertAt !== undefined)) {
      throw new AppError(403, 'La Responsable est seule autorisée à modifier les unités et seuils de stock.');
    }
    const item = await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM RestaurantMenuItem WHERE id = ${menuItemId} FOR UPDATE`;
      const current = await tx.restaurantMenuItem.findUnique({ where: { id: menuItemId } });
      if (!current || current.deletedAt) throw new AppError(404, 'Produit introuvable.');
      const defaultUnit = ['DRINK', 'SOFT_DRINK', 'JUICE', 'WATER', 'BEER', 'WINE', 'WHISKY', 'SPIRIT', 'COCKTAIL'].includes(current.category) ? 'bouteille(s)' : 'unité(s)';
      const stockUnit = canConfigureStock ? unit ?? current.stockUnit ?? defaultUnit : current.stockUnit ?? defaultUnit;
      const updated = await tx.restaurantMenuItem.update({ where: { id: menuItemId }, data: { stockQuantity: quantity, stockUnit, stockAlertAt: canConfigureStock ? alertAt ?? current.stockAlertAt : current.stockAlertAt } });
      await tx.restaurantStockCount.create({ data: { menuItemId, countedBy: scope.userId, countedByName: scope.name, previousQuantity: current.stockQuantity, countedQuantity: quantity, note: note || null } });
      const counted = new Prisma.Decimal(quantity);
      if (current.stockQuantity !== counted) {
        await tx.restaurantStockMovement.create({ data: {
          menuItemId,
          type: 'COUNT',
          quantity: current.stockQuantity === null ? counted : counted.sub(current.stockQuantity).abs(),
          previousQuantity: current.stockQuantity,
          resultingQuantity: counted,
          note: note || null,
          createdBy: scope.userId,
          createdByName: scope.name,
        } });
      }
      await tx.auditLog.create({ data: { actorId: scope.userId, action: 'RESTAURANT_STOCK_COUNT', result: 'SUCCESS', targetId: menuItemId, details: { item: current.name, previous: current.stockQuantity?.toFixed(2) ?? null, quantity, unit, note: note ?? null } } });
      return updated;
    });
    return NextResponse.json({ item: { id: item.id, name: item.name, stockQuantity: item.stockQuantity?.toFixed(2) ?? null, stockUnit: item.stockUnit, stockAlertAt: item.stockAlertAt?.toFixed(2) ?? null } });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

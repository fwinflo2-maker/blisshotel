import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const menuItemSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional().nullable(),
  category: z.enum(['FOOD', 'DRINK', 'BREAKFAST']),
  billingUnit: z.enum(['ITEM', 'ROOM_NIGHT']).default('ITEM'),
  price: z.coerce.number().finite().min(0).max(100000000),
});

export async function GET() {
  try {
    const scope = await authorizedScope('restaurant.orders.manage');
    const canManage = scope.permissions.includes('restaurant.menu.manage');
    const items = await db.restaurantMenuItem.findMany({
      where: canManage ? {} : { active: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({ items: items.map((item) => ({ ...item, price: item.price.toFixed(2) })) });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const scope = await authorizedScope('restaurant.menu.manage');
    const parsed = menuItemSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Vérifiez le nom, la catégorie et le prix du produit.' }, { status: 400 });
    const item = await db.restaurantMenuItem.create({
      data: {
        ...parsed.data,
        description: parsed.data.description || null,
        price: parsed.data.price.toFixed(2),
      },
    });
    await db.auditLog.create({
      data: { actorId: scope.userId, action: 'RESTAURANT_MENU_ITEM_CREATE', result: 'SUCCESS', targetId: item.id, details: { name: item.name, category: item.category, price: item.price.toFixed(2) } },
    });
    return NextResponse.json({ item: { ...item, price: item.price.toFixed(2) } }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  category: z.enum(['FOOD', 'DRINK', 'BREAKFAST']).optional(),
  billingUnit: z.enum(['ITEM', 'ROOM_NIGHT']).optional(),
  price: z.coerce.number().finite().min(0).max(100000000).optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await authorizedScope('restaurant.menu.manage');
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Modification de produit invalide.' }, { status: 400 });
    const { id } = await params;
    const existing = await db.restaurantMenuItem.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Produit introuvable.');
    const item = await db.restaurantMenuItem.update({
      where: { id },
      data: { ...parsed.data, ...(parsed.data.price !== undefined ? { price: parsed.data.price.toFixed(2) } : {}) },
    });
    await db.auditLog.create({
      data: { actorId: scope.userId, action: 'RESTAURANT_MENU_ITEM_UPDATE', result: 'SUCCESS', targetId: id, details: parsed.data },
    });
    return NextResponse.json({ item: { ...item, price: item.price.toFixed(2) } });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

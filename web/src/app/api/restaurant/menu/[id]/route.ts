import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const updateSchema = z.object({
  code: z.string().trim().max(60).nullable().optional(),
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  category: z.enum(['FOOD', 'DRINK', 'BREAKFAST', 'SOFT_DRINK', 'JUICE', 'WATER', 'BEER', 'WINE', 'WHISKY', 'SPIRIT', 'COCKTAIL', 'STARTER', 'DESSERT', 'OTHER']).optional(),
  billingUnit: z.enum(['ITEM', 'ROOM_NIGHT']).optional(),
  price: z.coerce.number().finite().min(0).max(100000000).optional(),
  purchasePrice: z.coerce.number().finite().min(0).max(100000000).nullable().optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await authorizedScope('restaurant.menu.manage');
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Modification de produit invalide.' }, { status: 400 });
    const { id } = await params;
    const existing = await db.restaurantMenuItem.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new AppError(404, 'Produit introuvable.');
    const item = await db.restaurantMenuItem.update({
      where: { id },
      data: { ...parsed.data, ...(parsed.data.price !== undefined ? { price: parsed.data.price.toFixed(2) } : {}), ...(parsed.data.purchasePrice !== undefined && parsed.data.purchasePrice !== null ? { purchasePrice: parsed.data.purchasePrice.toFixed(2) } : {}) },
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await authorizedScope('restaurant.menu.manage');
    const { id } = await params;
    const item = await db.$transaction(async (tx) => {
      const existing = await tx.restaurantMenuItem.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) throw new AppError(404, 'Produit introuvable.');
      const deleted = await tx.restaurantMenuItem.update({ where: { id }, data: { active: false, deletedAt: new Date(), code: null } });
      await tx.auditLog.create({
        data: { actorId: scope.userId, action: 'RESTAURANT_MENU_ITEM_DELETE', result: 'SUCCESS', targetId: id, details: { name: existing.name, code: existing.code, category: existing.category } },
      });
      return deleted;
    });
    return NextResponse.json({ item: { id: item.id, name: item.name, deletedAt: item.deletedAt?.toISOString() ?? null } });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope, scopeFor } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const createSchema = z.object({ number: z.string().trim().min(1).max(30), capacity: z.coerce.number().int().min(1).max(100) });
const updateSchema = z.object({
  number: z.string().trim().min(1).max(30).optional(),
  capacity: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['FREE', 'OCCUPIED', 'TO_CLEAN']).optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function GET() {
  try {
    await authorizedScope('restaurant.orders.manage');
    const tables = await db.restaurantTable.findMany({ where: { active: true }, orderBy: { number: 'asc' } });
    return NextResponse.json({ tables });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const scope = await scopeFor();
    if (!scope.permissions.includes('restaurant.tables.manage') && scope.roleCode !== 'RESTAURANT_MANAGER') throw new AppError(403, 'Vous ne pouvez pas gérer les tables du restaurant.');
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Vérifiez le numéro et la capacité de la table.' }, { status: 400 });
    const table = await db.restaurantTable.create({ data: parsed.data });
    await db.auditLog.create({ data: { actorId: scope.userId, action: 'RESTAURANT_TABLE_CREATE', result: 'SUCCESS', targetId: table.id, details: parsed.data } });
    return NextResponse.json({ table }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function PATCH(request: Request) {
  try {
    const scope = await scopeFor();
    if (!scope.permissions.includes('restaurant.tables.manage') && scope.roleCode !== 'RESTAURANT_MANAGER') throw new AppError(403, 'Vous ne pouvez pas gérer les tables du restaurant.');
    const body = await request.json().catch(() => null) as unknown;
    const parsed = updateSchema.safeParse(body && typeof body === 'object' ? body : null);
    const id = body && typeof body === 'object' && 'id' in body && typeof body.id === 'string' ? body.id : '';
    if (!parsed.success || !id) return NextResponse.json({ error: 'Modification de table invalide.' }, { status: 400 });
    const current = await db.restaurantTable.findUnique({ where: { id } });
    if (!current) throw new AppError(404, 'Table introuvable.');
    if (parsed.data.status === 'FREE' && current.status !== 'FREE') {
      const openOrders = await db.restaurantOrder.count({ where: { tableId: id, status: { in: ['CONFIRMED', 'PREPARING', 'READY'] } } });
      if (openOrders) throw new AppError(409, 'La table a encore une commande en cours.');
    }
    const table = await db.restaurantTable.update({ where: { id }, data: parsed.data });
    await db.auditLog.create({ data: { actorId: scope.userId, action: 'RESTAURANT_TABLE_UPDATE', result: 'SUCCESS', targetId: id, details: { before: { number: current.number, capacity: current.capacity, status: current.status, active: current.active }, after: parsed.data } } });
    return NextResponse.json({ table });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

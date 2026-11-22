import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/server/db';
import { AppError } from '@/server/policy';
import { platformApi } from '@/server/platform-admin';

export const instant = false;

const money = z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/);

export async function GET() {
  return platformApi(async () => {
    const [categories, rooms, paymentMethods] = await Promise.all([
      db.roomCategory.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { rooms: true } } },
      }),
      db.room.findMany({
        orderBy: [{ floor: 'asc' }, { number: 'asc' }],
        include: {
          category: { select: { id: true, name: true } },
          reservations: { where: { stay: { is: { checkedOutAt: null } } }, take: 1, select: { client: { select: { name: true } } } },
        },
      }),
      db.paymentMethod.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return NextResponse.json({
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        capacity: category.capacity,
        nightlyRate: category.nightlyRate.toFixed(2),
        siestaRate: category.siestaRate?.toFixed(2) ?? null,
        active: category.active,
        roomCount: category._count.rooms,
      })),
      rooms: rooms.map((room) => ({
        id: room.id,
        number: room.number,
        floor: room.floor,
        status: room.reservations.length ? 'OCCUPIED' : room.status === 'OCCUPIED' ? (room.housekeepingStatus === 'CLEAN' && room.technicalStatus === 'OPERATIONAL' ? 'AVAILABLE' : 'DIRTY') : room.status,
        currentGuest: room.reservations[0]?.client.name ?? null,
        housekeepingStatus: room.housekeepingStatus,
        technicalStatus: room.technicalStatus,
        active: room.active,
        capacity: room.capacity,
        bedType: room.bedType,
        area: room.area?.toFixed(2) ?? null,
        description: room.description,
        observations: room.observations,
        equipment: room.equipment,
        photos: room.photos,
        categoryId: room.categoryId,
        category: room.category.name,
        nightlyRateMin: room.nightlyRateMin?.toFixed(2) ?? null,
        nightlyRateMax: room.nightlyRateMax?.toFixed(2) ?? null,
      })),
      paymentMethods: paymentMethods.map((method) => ({
        id: method.id,
        code: method.code,
        name: method.name,
        active: method.active,
      })),
    });
  });
}

const postSchema = z.discriminatedUnion('entity', [
  z.object({
    entity: z.literal('category'),
    name: z.string().trim().min(2).max(100),
    capacity: z.number().int().min(1).max(2147483647).nullable(),
    nightlyRate: money,
    siestaRate: z.union([money, z.literal('')]).optional(),
  }),
  z.object({
    entity: z.literal('room'),
    number: z.string().trim().min(1).max(30),
    floor: z.string().trim().max(30).optional(),
    categoryId: z.string().min(1),
    capacity: z.number().int().min(1).max(2147483647).nullable().optional(),
    bedType: z.string().trim().max(100).nullable().optional(),
    area: z.number().positive().nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    observations: z.string().trim().max(2000).nullable().optional(),
    equipment: z.array(z.string().trim().min(1).max(100)).nullable().optional(),
    photos: z.array(z.string().url()).nullable().optional(),
    active: z.boolean().optional(),
  }),
  z.object({
    entity: z.literal('method'),
    code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_]+$/, 'Code en majuscules.'),
    name: z.string().trim().min(2).max(80),
  }),
]);

export async function POST(request: Request) {
  return platformApi(async (actor) => {
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Données d’inventaire invalides.' }, { status: 400 });
    const input = parsed.data;

    const result = await db.$transaction(async (tx) => {
      if (input.entity === 'category') {
        const exists = await tx.roomCategory.findUnique({ where: { name: input.name }, select: { id: true } });
        if (exists) throw new AppError(409, 'Ce code ou ce nom existe déjà.');
        const created = await tx.roomCategory.create({
          data: {
            name: input.name,
            capacity: input.capacity,
            nightlyRate: new Prisma.Decimal(input.nightlyRate),
            siestaRate: input.siestaRate ? new Prisma.Decimal(input.siestaRate) : null,
          },
        });
        return { id: created.id, name: created.name };
      }
      if (input.entity === 'room') {
        const category = await tx.roomCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
        if (!category) throw new AppError(400, 'Catégorie de chambre introuvable.');
        const exists = await tx.room.findUnique({ where: { number: input.number }, select: { id: true } });
        if (exists) throw new AppError(409, 'Ce code ou ce nom existe déjà.');
        const created = await tx.room.create({
          data: {
            number: input.number,
            floor: input.floor || null,
            categoryId: category.id,
            capacity: input.capacity ?? null,
            bedType: input.bedType ?? null,
            area: input.area ? new Prisma.Decimal(input.area) : null,
            description: input.description ?? null,
            observations: input.observations ?? null,
            equipment: input.equipment ? input.equipment : Prisma.JsonNull,
            photos: input.photos ? input.photos : Prisma.JsonNull,
            active: input.active ?? true,
          },
        });
        return { id: created.id, name: created.number };
      }
      const exists = await tx.paymentMethod.findUnique({ where: { code: input.code }, select: { id: true } });
      if (exists) throw new AppError(409, 'Ce code ou ce nom existe déjà.');
      const created = await tx.paymentMethod.create({
        data: { code: input.code, name: input.name },
      });
      return { id: created.id, name: created.name };
    });

    await db.auditLog.create({
      data: { actorId: actor.id, action: 'PLATFORM_INVENTORY_CREATE', result: 'SUCCESS', targetId: result.id, details: { entity: input.entity, name: result.name } },
    });
    return NextResponse.json({ item: result }, { status: 201 });
  });
}

const patchSchema = z.discriminatedUnion('entity', [
  z.object({
    entity: z.literal('category'),
    id: z.string().min(1),
    name: z.string().trim().min(2).max(100).optional(),
    capacity: z.number().int().min(1).max(2147483647).nullable().optional(),
    nightlyRate: money.optional(),
    siestaRate: z.union([money, z.literal(''), z.null()]).optional(),
    active: z.boolean().optional(),
  }),
  z.object({
    entity: z.literal('room'),
    id: z.string().min(1),
    number: z.string().trim().min(1).max(30).optional(),
    floor: z.string().trim().max(30).nullable().optional(),
    categoryId: z.string().min(1).optional(),
    status: z.enum(['AVAILABLE', 'OCCUPIED', 'DIRTY', 'OUT_OF_SERVICE']).optional(),
    housekeepingStatus: z.enum(['CLEAN', 'TO_CLEAN', 'IN_PROGRESS', 'TO_INSPECT', 'OUT_OF_SERVICE']).optional(),
    technicalStatus: z.enum(['OPERATIONAL','INTERVENTION_REQUIRED','UNDER_MAINTENANCE','OUT_OF_SERVICE']).optional(),
    active: z.boolean().optional(),
    capacity: z.number().int().min(1).max(2147483647).nullable().optional(),
    bedType: z.string().trim().max(100).nullable().optional(),
    area: z.number().positive().nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    observations: z.string().trim().max(2000).nullable().optional(),
    equipment: z.array(z.string().trim().min(1).max(100)).nullable().optional(),
    photos: z.array(z.string().url()).nullable().optional(),
    nightlyRateMin: z.union([money, z.literal(''), z.null()]).optional(),
    nightlyRateMax: z.union([money, z.literal(''), z.null()]).optional(),
  }),
  z.object({
    entity: z.literal('method'),
    id: z.string().min(1),
    name: z.string().trim().min(2).max(80).optional(),
    active: z.boolean().optional(),
  }),
]);

export async function PATCH(request: Request) {
  return platformApi(async (actor) => {
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Modification d’inventaire invalide.' }, { status: 400 });
    const input = parsed.data;

    const updated = await db.$transaction(async (tx) => {
      if (input.entity === 'category') {
        const before = await tx.roomCategory.findUnique({ where: { id: input.id } });
        if (!before) throw new AppError(404, 'Catégorie introuvable.');
        return await tx.roomCategory.update({
          where: { id: input.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
            ...(input.nightlyRate !== undefined ? { nightlyRate: new Prisma.Decimal(input.nightlyRate) } : {}),
            ...('siestaRate' in input && input.siestaRate !== undefined
              ? { siestaRate: input.siestaRate ? new Prisma.Decimal(input.siestaRate) : null }
              : {}),
            ...(input.active !== undefined ? { active: input.active } : {}),
          },
        });
      }
      if (input.entity === 'room') {
        const before = await tx.room.findUnique({ where: { id: input.id }, include: { reservations: { where: { stay: { is: { checkedOutAt: null } } }, select: { id: true } } } });
        if (!before) throw new AppError(404, 'Chambre introuvable.');
        if (input.number !== undefined && input.number !== before.number) {
          const duplicate = await tx.room.findUnique({ where: { number: input.number }, select: { id: true } });
          if (duplicate) throw new AppError(409, 'Ce numéro de chambre existe déjà.');
        }
        const nextMin = input.nightlyRateMin === undefined ? before.nightlyRateMin : input.nightlyRateMin ? new Prisma.Decimal(input.nightlyRateMin) : null;
        const nextMax = input.nightlyRateMax === undefined ? before.nightlyRateMax : input.nightlyRateMax ? new Prisma.Decimal(input.nightlyRateMax) : null;
        if ((nextMin && nextMax && nextMin.gt(nextMax)) || Boolean(nextMin) !== Boolean(nextMax)) {
          throw new AppError(400, 'Configurez les deux bornes tarifaires et vérifiez que le minimum ne dépasse pas le maximum.');
        }
        if (input.status === 'OUT_OF_SERVICE' && before.reservations.length) {
          throw new AppError(409, 'Impossible de mettre hors service une chambre actuellement occupée. Effectuez d’abord le changement de chambre ou le check-out.');
        }
        if (input.status === 'AVAILABLE' && before.reservations.length && before.status === 'OCCUPIED') {
          throw new AppError(409, 'Une chambre avec un séjour en cours ne peut pas être déclarée disponible.');
        }
        const nextHousekeeping = input.housekeepingStatus;
        if (input.status === 'AVAILABLE' && nextHousekeeping && nextHousekeeping !== 'CLEAN') {
          throw new AppError(409, 'Une chambre ne peut être déclarée disponible si elle n’est pas propre.');
        }
        const room = await tx.room.update({
          where: { id: input.id },
          data: {
            ...(input.number !== undefined ? { number: input.number } : {}),
            ...(input.floor !== undefined ? { floor: input.floor } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.housekeepingStatus !== undefined ? { housekeepingStatus: input.housekeepingStatus } : {}),
            ...(input.technicalStatus !== undefined ? { technicalStatus: input.technicalStatus } : {}),
            ...(input.active !== undefined ? { active: input.active } : {}),
            ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
            ...(input.bedType !== undefined ? { bedType: input.bedType } : {}),
            ...(input.area !== undefined ? { area: input.area ? new Prisma.Decimal(input.area) : null } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.observations !== undefined ? { observations: input.observations } : {}),
            ...(input.equipment !== undefined ? { equipment: input.equipment ?? Prisma.JsonNull } : {}),
            ...(input.photos !== undefined ? { photos: input.photos ?? Prisma.JsonNull } : {}),
            ...(input.nightlyRateMin !== undefined ? { nightlyRateMin: nextMin } : {}),
            ...(input.nightlyRateMax !== undefined ? { nightlyRateMax: nextMax } : {}),
          },
        });
        if (input.status === 'OUT_OF_SERVICE') await tx.room.update({ where: { id: room.id }, data: { housekeepingStatus: 'OUT_OF_SERVICE' } });
        if (input.status === 'AVAILABLE' && input.housekeepingStatus === undefined) {
          await tx.room.update({ where: { id: room.id }, data: { housekeepingStatus: 'CLEAN' } });
        }
        if (input.housekeepingStatus && input.housekeepingStatus !== 'CLEAN' && input.status === 'AVAILABLE') {
          throw new AppError(409, 'Une chambre non propre ne peut pas être marquée disponible.');
        }
        if (input.status !== undefined || input.housekeepingStatus !== undefined || input.technicalStatus !== undefined) {
          const history: { dimension: string; previousStatus: string; nextStatus: string }[] = [];
          if (input.status !== undefined && input.status !== before.status) {
            history.push({ dimension: 'OCCUPATION', previousStatus: before.status, nextStatus: input.status });
          }
          if (input.housekeepingStatus !== undefined && input.housekeepingStatus !== before.housekeepingStatus) {
            history.push({ dimension: 'HOUSEKEEPING', previousStatus: before.housekeepingStatus, nextStatus: input.housekeepingStatus });
          }
          if (input.technicalStatus !== undefined && input.technicalStatus !== before.technicalStatus) {
            history.push({ dimension: 'TECHNICAL', previousStatus: before.technicalStatus, nextStatus: input.technicalStatus });
          }
          if (history.length) await tx.roomStatusHistory.createMany({
            data: history.map((item) => ({
              roomId: room.id,
              dimension: item.dimension,
              previousStatus: item.previousStatus,
              nextStatus: item.nextStatus,
              reason: 'Modification administrée',
              source: 'HOTEL_ADMIN',
              actorId: actor.id,
            })),
          });
        }
        return room;
      }
      const before = await tx.paymentMethod.findUnique({ where: { id: input.id } });
      if (!before) throw new AppError(404, 'Moyen de paiement introuvable.');
      return await tx.paymentMethod.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
    });

    await db.auditLog.create({
      data: { actorId: actor.id, action: 'PLATFORM_INVENTORY_UPDATE', result: 'SUCCESS', targetId: parsed.data.id, details: { entity: parsed.data.entity, ...(parsed.data.entity === 'room' && (parsed.data.nightlyRateMin !== undefined || parsed.data.nightlyRateMax !== undefined) ? { pricingChange: true, nightlyRateMin: parsed.data.nightlyRateMin, nightlyRateMax: parsed.data.nightlyRateMax } : {}), ...(parsed.data.entity === 'method' ? { paymentMethodChange: { name: parsed.data.name, active: parsed.data.active } } : {}) } },
    });
    return NextResponse.json({ ok: true, item: { id: updated.id } });
  });
}

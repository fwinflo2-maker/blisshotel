import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Prisma } from '@prisma/client';
import { createDatabase } from '../src/lib/database';
import { groups, roleTemplates } from '../src/features/access/catalog';
import { nightlyRateRangeForRoom } from '../src/features/reception/domain';
const db = createDatabase();
async function main() {
  for (const [group, codes] of Object.entries(groups)) for (const code of codes) {
    await db.permission.upsert({ where: { code }, create: { code, group }, update: { group } });
  }
  for (const role of roleTemplates) {
    // Ne jamais réinitialiser les permissions personnalisées lors d'un seed.
    await db.role.upsert({ where: { key: `template:${role.code}` }, update: {}, create: {
      key: `template:${role.code}`, code: role.code, name: role.name, optional: !!role.optional,
      permissions: { create: role.permissions.map(permissionCode => ({ permissionCode })) },
    } });
  }
  await db.restaurantMenuItem.upsert({
    where: { code: 'BREAKFAST_ROOM_NIGHT' },
    update: { name: 'Petit-dejeuner a la carte', description: "Portion facultative a commander a l'unite", billingUnit: 'ITEM' },
    create: {
      id: 'restaurant-breakfast-room-night',
      code: 'BREAKFAST_ROOM_NIGHT',
      name: 'Petit-dejeuner a la carte',
      description: "Portion facultative a commander a l'unite",
      category: 'BREAKFAST',
      billingUnit: 'ITEM',
      price: new Prisma.Decimal('5000.00'),
    },
  });
  await db.restaurantMenuItem.upsert({
    where: { code: 'LUNCH_ROOM_NIGHT' },
    update: { name: 'Dejeuner a la carte', description: 'Portion facultative a commander separement', category: 'FOOD', billingUnit: 'ITEM' },
    create: {
      id: 'restaurant-lunch-room-night',
      code: 'LUNCH_ROOM_NIGHT',
      name: 'Dejeuner a la carte',
      description: 'Portion facultative a commander separement',
      category: 'FOOD',
      billingUnit: 'ITEM',
      price: new Prisma.Decimal('5000.00'),
    },
  });
  await db.hotelConfiguration.upsert({
    where: { id: 1 },
    update: { currency: 'XAF' },
    create: { id: 1, name: 'BLISS HOTEL', timezone: 'Africa/Brazzaville', currency: 'XAF', checkOutTime: '12:00' },
  });
  const standard = await db.roomCategory.upsert({
    where: { name: 'Chambre standard' },
    update: {},
    create: { name: 'Chambre standard', capacity: null, nightlyRate: new Prisma.Decimal('0') },
  });
  const suite = await db.roomCategory.upsert({
    where: { name: 'Suite' },
    update: {},
    create: { name: 'Suite', capacity: null, nightlyRate: new Prisma.Decimal('0') },
  });
  const inventory = [
    ['101', '1', 'STANDARD'], ['106', '1', 'STANDARD'], ['107', '1', 'STANDARD'],
    ['201', '2', 'STANDARD'], ['202', '2', 'STANDARD'], ['203', '2', 'STANDARD'],
    ['205', '2', 'STANDARD'], ['206', '2', 'STANDARD'], ['207', '2', 'STANDARD'], ['208', '2', 'STANDARD'],
    ['301', '3', 'STANDARD'], ['302', '3', 'STANDARD'], ['303', '3', 'STANDARD'], ['304', '3', 'STANDARD'],
    ['305', '3', 'STANDARD'], ['306', '3', 'STANDARD'], ['307', '3', 'STANDARD'], ['308', '3', 'STANDARD'],
    ['401', '4', 'STANDARD'], ['402', '4', 'STANDARD'], ['403', '4', 'STANDARD'], ['404', '4', 'STANDARD'],
    ['405', '4', 'STANDARD'], ['406', '4', 'STANDARD'], ['440', '4', 'SUITE'],
  ] as const;
  const inventoryNumbers = inventory.map(([number]) => number);
  for (const [number, floor, category] of inventory) {
    const rateRange = nightlyRateRangeForRoom(number);
    const nightlyRates = rateRange ? {
      nightlyRateMin: new Prisma.Decimal(rateRange.minimum),
      nightlyRateMax: new Prisma.Decimal(rateRange.maximum),
    } : { nightlyRateMin: null, nightlyRateMax: null };
    await db.room.upsert({
      where: { number },
      update: {
        floor,
        categoryId: category === 'SUITE' ? suite.id : standard.id,
        active: true,
        ...nightlyRates,
      },
      create: { number, floor, categoryId: category === 'SUITE' ? suite.id : standard.id, ...nightlyRates },
    });
  }
  await db.room.updateMany({
    where: { number: { notIn: inventoryNumbers } },
    data: { active: false },
  });
  console.info('Catalogue créé : rôles, configuration unique BLISS HOTEL et inventaire initial des chambres.');
}
main().finally(() => db.$disconnect());

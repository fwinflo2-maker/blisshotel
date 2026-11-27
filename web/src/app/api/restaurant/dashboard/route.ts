import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { hotelDateKey, parseDateOnly, parseHotelDateTime } from '@/server/reception';

export const instant = false;

export async function GET() {
  try {
    await authorizedScope('restaurant.orders.manage');
    const configuration = await hotelConfiguration();
    const today = hotelDateKey(new Date(), configuration.timezone);
    const nextDate = parseDateOnly(today);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const from = parseHotelDateTime(`${today}T00:00`, configuration.timezone);
    const until = parseHotelDateTime(`${nextDate.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    const weekStart = parseDateOnly(today);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const weekFrom = parseHotelDateTime(`${weekStart.toISOString().slice(0, 10)}T00:00`, configuration.timezone);
    const monthStart = parseDateOnly(`${today.slice(0, 7)}-01`);
    const monthFrom = parseHotelDateTime(`${today.slice(0, 7)}-01T00:00`, configuration.timezone);
    const aggregateSales = (gte: Date, lt: Date) => db.restaurantOrder.aggregate({ where: { createdAt: { gte, lt }, status: 'SERVED' }, _sum: { totalAmount: true }, _count: { id: true } });

    const [sales, weekSales, monthSales, orders, paid, byServer, directPaidByServer, walkInSales, hostedSales, transferred, stockItems, recentSupplies, servedLines, cancelled, breakfastAssociations, activeServers] = await Promise.all([
      db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED' }, _sum: { totalAmount: true }, _count: { id: true } }),
      aggregateSales(weekFrom, until),
      aggregateSales(monthFrom, until),
      db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, status: { not: 'REJECTED' } }, _count: { id: true } }),
      db.restaurantOrder.aggregate({ where: { paidAt: { gte: from, lt: until } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.groupBy({ by: ['createdByName', 'status'], where: { createdAt: { gte: from, lt: until }, status: { not: 'REJECTED' } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.groupBy({ by: ['createdByName'], where: { createdAt: { gte: from, lt: until }, paidAt: { not: null } }, _sum: { totalAmount: true } }),
      db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED', reservationId: null }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, status: 'SERVED', reservationId: { not: null } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantOrder.aggregate({ where: { createdAt: { gte: from, lt: until }, folioLine: { isNot: null } }, _sum: { totalAmount: true }, _count: { id: true } }),
      db.restaurantMenuItem.findMany({ where: { deletedAt: null, billingUnit: 'ITEM', stockQuantity: { not: null } }, select: { stockQuantity: true, stockAlertAt: true, purchasePrice: true } }),
      db.restaurantStockMovement.findMany({ where: { type: 'SUPPLY', createdAt: { gte: monthFrom, lt: until } }, include: { menuItem: { select: { name: true, stockUnit: true } } }, orderBy: { createdAt: 'desc' }, take: 8 }),
      db.restaurantOrderLine.findMany({ where: { order: { createdAt: { gte: monthFrom, lt: until }, status: 'SERVED' } }, select: { name: true, quantity: true } }),
      db.restaurantOrder.count({ where: { createdAt: { gte: from, lt: until }, status: 'REJECTED' } }),
      db.folioLine.aggregate({ where: { type: 'SERVICE', description: 'Petit-déjeuner', createdAt: { gte: from, lt: until } }, _count: { id: true }, _sum: { amount: true } }),
      db.user.findMany({ where: { active: true, role: { is: { code: 'BAR_SERVER' } } }, select: { name: true }, orderBy: { name: 'asc' } }),
    ]);
    const serverMap = new Map<string, { orders: number; served: number; sales: Prisma.Decimal; collected: Prisma.Decimal }>();
    for (const server of activeServers) serverMap.set(server.name, { orders: 0, served: 0, sales: new Prisma.Decimal(0), collected: new Prisma.Decimal(0) });
    for (const row of byServer) {
      const current = serverMap.get(row.createdByName) ?? { orders: 0, served: 0, sales: new Prisma.Decimal(0), collected: new Prisma.Decimal(0) };
      current.orders += row._count.id;
      if (row.status === 'SERVED') {
        current.sales = current.sales.add(row._sum.totalAmount ?? 0);
        current.served += row._count.id;
      }
      serverMap.set(row.createdByName, current);
    }
    for (const row of directPaidByServer) {
      const current = serverMap.get(row.createdByName) ?? { orders: 0, served: 0, sales: new Prisma.Decimal(0), collected: new Prisma.Decimal(0) };
      current.collected = current.collected.add(row._sum.totalAmount ?? 0);
      serverMap.set(row.createdByName, current);
    }

    return NextResponse.json({
      date: today,
      sales: { orders: sales._count.id, amount: sales._sum.totalAmount?.toFixed(2) ?? '0.00' },
      orders: orders._count.id,
      collected: { orders: paid._count.id, amount: paid._sum.totalAmount?.toFixed(2) ?? '0.00' },
      weekSales: { orders: weekSales._count.id, amount: weekSales._sum.totalAmount?.toFixed(2) ?? '0.00' },
      monthSales: { orders: monthSales._count.id, amount: monthSales._sum.totalAmount?.toFixed(2) ?? '0.00' },
      walkInSales: { orders: walkInSales._count.id, amount: walkInSales._sum.totalAmount?.toFixed(2) ?? '0.00' },
      hostedSales: { orders: hostedSales._count.id, amount: hostedSales._sum.totalAmount?.toFixed(2) ?? '0.00' },
      transferred: { orders: transferred._count.id, amount: transferred._sum.totalAmount?.toFixed(2) ?? '0.00' },
      cancelled,
      breakfastAssociations: { count: breakfastAssociations._count.id, amount: breakfastAssociations._sum.amount?.toFixed(2) ?? '0.00' },
      inventory: {
        tracked: stockItems.length,
        outOfStock: stockItems.filter((item) => item.stockQuantity?.lte(0)).length,
        lowStock: stockItems.filter((item) => item.stockQuantity && item.stockAlertAt && item.stockQuantity.gt(0) && item.stockQuantity.lte(item.stockAlertAt)).length,
        value: stockItems.reduce((sum, item) => sum.add((item.stockQuantity ?? new Prisma.Decimal(0)).mul(item.purchasePrice ?? new Prisma.Decimal(0))), new Prisma.Decimal(0)).toFixed(2),
      },
      recentSupplies: recentSupplies.map((movement) => ({ item: movement.menuItem.name, quantity: movement.quantity.toFixed(2), unit: movement.menuItem.stockUnit, at: movement.createdAt.toISOString() })),
      topProducts: [...servedLines.reduce((map, line) => map.set(line.name, (map.get(line.name) ?? 0) + line.quantity), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, quantity]) => ({ name, quantity })),
      salesByServer: [...serverMap.entries()].map(([name, row]) => ({ name, orders: row.orders, served: row.served, sales: row.sales.toFixed(2), collected: row.collected.toFixed(2) })),
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

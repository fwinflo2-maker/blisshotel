import { Prisma } from '@prisma/client';

export const restaurantOrderInclude = {
  room: { select: { id: true, number: true } },
  reservation: {
    select: {
      id: true,
      reference: true,
      checkInDate: true,
      checkOutDate: true,
      client: { select: { name: true, phone: true } },
    },
  },
  lines: { orderBy: { name: 'asc' } },
  folioLine: { select: { id: true } },
} satisfies Prisma.RestaurantOrderInclude;

type RestaurantOrderWithDetails = Prisma.RestaurantOrderGetPayload<{ include: typeof restaurantOrderInclude }>;

export function presentRestaurantOrder(order: RestaurantOrderWithDetails) {
  return {
    ...order,
    totalAmount: order.totalAmount.toFixed(2),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    rejectedAt: order.rejectedAt?.toISOString() ?? null,
    preparedAt: order.preparedAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    servedAt: order.servedAt?.toISOString() ?? null,
    reservation: order.reservation ? {
      ...order.reservation,
      checkInDate: order.reservation.checkInDate.toISOString().slice(0, 10),
      checkOutDate: order.reservation.checkOutDate.toISOString().slice(0, 10),
    } : null,
    lines: order.lines.map((line) => ({
      ...line,
      unitPrice: line.unitPrice.toFixed(2),
      lineTotal: line.lineTotal.toFixed(2),
    })),
  };
}

import { Prisma } from '@prisma/client';

export function amountAtXafRate(
  amount: string | number | Prisma.Decimal,
  xafPerUnit: Prisma.Decimal,
) {
  return new Prisma.Decimal(amount)
    .mul(xafPerUnit)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function amountFromXafRate(
  amount: string | number | Prisma.Decimal,
  xafPerUnit: Prisma.Decimal,
) {
  return new Prisma.Decimal(amount)
    .div(xafPerUnit)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

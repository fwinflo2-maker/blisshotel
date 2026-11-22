import { Prisma } from '@prisma/client';

type ClientReader = Pick<Prisma.TransactionClient, 'client'>;

export async function findPossibleClientDuplicates(
  database: ClientReader,
  input: { name: string; phone?: string; email?: string; idNumber?: string },
) {
  const OR: Prisma.ClientWhereInput[] = [
    ...(input.idNumber ? [{ idNumber: input.idNumber }] : []),
    ...(input.phone ? [{ name: input.name, phone: input.phone }] : []),
    ...(input.email ? [{ name: input.name, email: input.email }] : []),
  ];
  if (!OR.length) return [];

  return database.client.findMany({
    where: { OR },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      createdByName: true,
    },
  });
}

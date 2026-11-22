import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const lineSchema = z.object({
  description: z.string().trim().min(2).max(200),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = lineSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Libellé ou montant de prestation invalide.' }, { status: 400 });
    const input = parsed.data;
    const scope = await authorizedScope('folios.manage');
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.gt(0)) return NextResponse.json({ error: 'Le montant doit être supérieur à zéro.' }, { status: 400 });
    const { id } = await params;

    const line = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM Folio WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) throw new AppError(404, 'Folio introuvable.');
      const folio = await tx.folio.findFirst({ where: { id } });
      if (!folio) throw new AppError(404, 'Folio introuvable.');
      if (folio.status !== 'OPEN') throw new AppError(409, 'Ce folio est clôturé.');
      const invoice = await tx.invoice.findUnique({ where: { folioId: id }, select: { id: true } });
      if (invoice) throw new AppError(409, 'La facture est émise. Les prestations ne peuvent plus être ajoutées.');

      const created = await tx.folioLine.create({
        data: { folioId: id, type: 'SERVICE', description: input.description, amount, createdBy: scope.userId },
      });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_FOLIO_SERVICE_ADD',
          result: 'SUCCESS',
          targetId: created.id,
          details: { folioId: id, amount: amount.toFixed(2) },
        },
      });
      return created;
    });
    return NextResponse.json({ line: { ...line, amount: line.amount.toFixed(2) } }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

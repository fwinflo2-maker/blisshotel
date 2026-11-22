import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { folioTotals } from '@/server/reception';

export const instant = false;

const invoiceSchema = z.object({
  payerName: z.string().trim().min(2).max(160).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await authorizedScope('invoices.create');
    const parsed = invoiceSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Le nom du payeur est invalide.' }, { status: 400 });
    const { id } = await params;
    const invoice = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM Folio WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) throw new AppError(404, 'Folio introuvable.');
      const folio = await tx.folio.findFirst({
        where: { id },
        include: {
          lines: { select: { amount: true } },
          payments: { select: { amount: true } },
          invoice: true,
          reservation: { include: { client: { select: { name: true } } } },
        },
      });
      if (!folio) throw new AppError(404, 'Folio introuvable.');
      if (folio.invoice) return folio.invoice;
      if (folio.status !== 'OPEN') throw new AppError(409, 'Un folio clôturé doit déjà avoir sa facture.');
      const total = folioTotals(folio).billed;
      if (!total.gt(0)) throw new AppError(409, 'Le folio ne contient aucun montant à facturer.');
      const number = `BH-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
      const payerName = parsed.data.payerName ?? folio.reservation.client.name;
      const created = await tx.invoice.create({
        data: { folioId: id, number, payerName, totalAmount: total },
      });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_INVOICE_ISSUE',
          result: 'SUCCESS',
          targetId: created.id,
          details: { folioId: id, number, payerName, totalAmount: total.toFixed(2) },
        },
      });
      return created;
    });
    return NextResponse.json({
      invoice: { id: invoice.id, number: invoice.number, payerName: invoice.payerName, totalAmount: invoice.totalAmount.toFixed(2), issuedAt: invoice.issuedAt },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

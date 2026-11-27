import { NextResponse } from 'next/server';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { folioTotals } from '@/server/reception';
import { hotelConfiguration } from '@/server/hotel';
import { convertFromXaf } from '@/server/currency';

export const instant = false;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorizedScope('folios.view');
    const { id } = await params;
    const folio = await db.folio.findFirst({
      where: { id },
      include: {
        lines: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' }, include: { paymentMethod: { select: { name: true, code: true } } } },
        invoice: true,
        reservation: {
          include: {
            client: { select: { id: true, name: true, phone: true, email: true } },
            room: { select: { number: true } },
          },
        },
      },
    });
    if (!folio) throw new AppError(404, 'Folio introuvable.');
    const totals = folioTotals(folio);
    const configuration = await hotelConfiguration();
    const paymentAmount = await convertFromXaf(totals.balance, configuration.currency);
    return NextResponse.json({
      folio: {
        id: folio.id,
        status: folio.status,
        reservation: {
          id: folio.reservation.id,
          reference: folio.reservation.reference,
          status: folio.reservation.status,
          stayType: folio.reservation.stayType,
          checkInDate: folio.reservation.checkInDate.toISOString().slice(0, 10),
          checkOutDate: folio.reservation.checkOutDate.toISOString().slice(0, 10),
          client: folio.reservation.client,
          room: folio.reservation.room?.number ?? null,
        },
        lines: folio.lines.map((line) => ({
          id: line.id,
          type: line.type,
          description: line.description,
          amount: line.amount.toFixed(2),
          createdAt: line.createdAt,
        })),
        payments: folio.payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount.toFixed(2),
          method: payment.paymentMethod.name,
          methodCode: payment.paymentMethod.code,
          reference: payment.reference,
          createdAt: payment.createdAt,
        })),
        invoice: folio.invoice ? {
          id: folio.invoice.id,
          number: folio.invoice.number,
          payerName: folio.invoice.payerName,
          currency: folio.invoice.currency,
          totalAmount: folio.invoice.totalAmount.toFixed(2),
          issuedAt: folio.invoice.issuedAt,
        } : null,
        billed: totals.billed.toFixed(2),
        paid: totals.paid.toFixed(2),
        balance: totals.balance.toFixed(2),
        paymentAmount: paymentAmount.toFixed(2),
      },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

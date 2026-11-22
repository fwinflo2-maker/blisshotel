import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { folioTotals } from '@/server/reception';

export const instant = false;

const folioInclude = {
  lines: { select: { amount: true } },
  payments: { select: { amount: true } },
  invoice: { select: { id: true, number: true, payerName: true, totalAmount: true, issuedAt: true } },
  reservation: {
    select: {
      id: true,
      reference: true,
      status: true,
      createdBy: true,
      createdByName: true,
      checkInDate: true,
      checkOutDate: true,
      stayType: true,
      creator: { select: { name: true } },
      client: { select: { id: true, name: true, phone: true } },
      room: { select: { number: true } },
    },
  },
} satisfies Prisma.FolioInclude;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    await authorizedScope('folios.view');
    const status = url.searchParams.get('status') ?? 'all';
    const query = url.searchParams.get('q')?.trim() ?? '';

    const folios = await db.folio.findMany({
      where: {
        ...(query ? {
          OR: [
            { reservation: { reference: { contains: query } } },
            { reservation: { client: { name: { contains: query } } } },
            { reservation: { room: { number: { contains: query } } } },
            { invoice: { number: { contains: query } } },
          ],
        } : {}),
        ...(status === 'invoiced' ? { invoice: { isNot: {} } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: folioInclude,
    });

    const items = folios
      .filter((folio) => folio.reservation)
      .map((folio) => {
        const totals = folioTotals(folio);
        const paymentStatus = totals.balance.gt(0)
          ? (totals.paid.gt(0) ? 'partial' : 'unpaid')
          : 'paid';
        return {
          id: folio.id,
          status: folio.status,
          paymentStatus,
          billed: totals.billed.toFixed(2),
          paid: totals.paid.toFixed(2),
          balance: totals.balance.toFixed(2),
          invoice: folio.invoice,
          reservation: {
            id: folio.reservation.id,
            reference: folio.reservation.reference,
            status: folio.reservation.status,
            createdByName: folio.reservation.createdByName ?? folio.reservation.creator?.name ?? null,
            checkInDate: folio.reservation.checkInDate.toISOString().slice(0, 10),
            checkOutDate: folio.reservation.checkOutDate.toISOString().slice(0, 10),
            stayType: folio.reservation.stayType,
            client: folio.reservation.client,
            room: folio.reservation.room?.number ?? null,
          },
        };
      })
      .filter((item) => status === 'all' || status === 'invoiced' || item.paymentStatus === status);

    return NextResponse.json({ folios: items });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

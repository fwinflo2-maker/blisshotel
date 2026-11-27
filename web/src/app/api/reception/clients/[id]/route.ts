import { NextResponse } from 'next/server';
import { authorizedClientReadScope, authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { folioTotals } from '@/server/reception';
import { clientSchema } from '../route';

export const instant = false;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await authorizedClientReadScope();
    const { id } = await params;
    const client = await db.client.findFirst({
      where: { id, ...(scope.roleCode === 'RECEPTIONIST' ? { createdBy: scope.userId } : {}), ...(scope.roleCode === 'HOTEL_ADMIN' ? { OR: [{ createdBy: scope.userId }, { reservations: { some: { room: { is: { assignedHotelAdminId: scope.userId, active: true } } } } }] } : {}) },
      omit: { idDocumentData: true },
      include: {
        creator: { select: { name: true } },
        reservations: {
          ...(scope.roleCode === 'HOTEL_ADMIN' ? { where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } } } } : {}),
          orderBy: { checkInDate: 'desc' },
          include: {
            room: { select: { number: true } },
            creator: { select: { name: true } },
            folio: { include: { lines: { select: { amount: true } }, payments: { select: { amount: true } }, invoice: true } },
          },
        },
      },
    });
    if (!client) throw new AppError(404, 'Client introuvable.');

    return NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        nationality: client.nationality,
        address: client.address,
        idType: client.idType,
        idNumber: client.idNumber,
        notes: client.notes,
        idDocument: client.idDocumentName
          ? {
              name: client.idDocumentName,
              mime: client.idDocumentMime,
              size: client.idDocumentSize,
              uploadedAt: client.idDocumentUploadedAt,
              uploadedBy: client.idDocumentUploadedBy,
            }
          : null,
        createdBy: client.createdBy,
        createdByName: client.createdByName,
        createdAt: client.createdAt,
        creator: client.creator,
        reservations: client.reservations.map((reservation) => {
          const totals = reservation.folio ? folioTotals(reservation.folio) : null;
          return {
            id: reservation.id,
            reference: reservation.reference,
            status: reservation.status,
            checkInDate: reservation.checkInDate.toISOString().slice(0, 10),
            checkOutDate: reservation.checkOutDate.toISOString().slice(0, 10),
            room: reservation.room?.number ?? null,
            createdBy: reservation.createdBy,
            createdByName: reservation.createdByName ?? reservation.creator?.name ?? null,
            billed: scope.roleCode !== 'HOTEL_ADMIN' || scope.permissions.includes('reports.financial.view') ? totals?.billed.toFixed(2) ?? '0.00' : null,
            paid: scope.roleCode !== 'HOTEL_ADMIN' || scope.permissions.includes('reports.financial.view') ? totals?.paid.toFixed(2) ?? '0.00' : null,
            balance: scope.roleCode !== 'HOTEL_ADMIN' || scope.permissions.includes('reports.financial.view') ? totals?.balance.toFixed(2) ?? '0.00' : null,
            invoiceNumber: scope.roleCode !== 'HOTEL_ADMIN' || scope.permissions.includes('reports.financial.view') ? reservation.folio?.invoice?.number ?? null : null,
          };
        }),
      },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

/**
 * Updates the authorized identity fields of a client.
 * createdBy / createdByName are immutable: the original agent who registered
 * the client is kept permanently, even when another receptionist edits the file.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = clientSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Vérifiez les informations du client.' }, { status: 400 });
    const input = parsed.data;
    const scope = await authorizedScope('clients.update');
    const { id } = await params;

    const client = await db.$transaction(async (tx) => {
      const existing = await tx.client.findFirst({ where: { id } });
      if (!existing) throw new AppError(404, 'Client introuvable.');

      const changes: Record<string, { before: string | null; after: string | null }> = {};
      const next = {
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
        nationality: input.nationality || null,
        address: input.address || null,
        idType: input.idType || null,
        idNumber: input.idNumber || null,
        notes: input.notes || null,
      } as const;
      for (const [field, value] of Object.entries(next)) {
        const before = existing[field as keyof typeof existing] as string | null;
        if (before !== value) changes[field] = { before, after: value };
      }
      if (!Object.keys(changes).length) return existing;

      const updated = await tx.client.update({ where: { id }, data: next });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_CLIENT_UPDATE',
          result: 'SUCCESS',
          targetId: updated.id,
          details: { changes, editor: scope.name, creatorPreserved: updated.createdByName ?? null },
        },
      });
      return updated;
    });

    return NextResponse.json({ client: { id: client.id, name: client.name } });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

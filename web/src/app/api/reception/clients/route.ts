import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedClientReadScope, authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { findPossibleClientDuplicates } from '@/server/client-matching';

export const instant = false;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = await authorizedClientReadScope();
    const query = url.searchParams.get('q')?.trim() ?? '';
    const scopeWhere = scope.roleCode === 'HOTEL_ADMIN'
      ? { reservations: { some: { room: { is: { assignedHotelAdminId: scope.userId, active: true } } } } }
      : scope.roleCode === 'RECEPTIONIST' ? { createdBy: scope.userId } : {};
    const clients = await db.client.findMany({
      where: { AND: [scopeWhere, ...(query ? [{
          OR: [
            { name: { contains: query } },
            { phone: { contains: query } },
            { email: { contains: query } },
            { idNumber: { contains: query } },
            { reservations: { some: { reference: { contains: query } } } },
            { reservations: { some: { room: { number: { contains: query } } } } },
          ],
        }] : [])] },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        nationality: true,
        idDocumentName: true,
        idDocumentUploadedAt: true,
        createdBy: true,
        createdByName: true,
        createdAt: true,
        creator: { select: { name: true } },
        _count: { select: { reservations: scope.roleCode === 'HOTEL_ADMIN' ? { where: { room: { is: { assignedHotelAdminId: scope.userId, active: true } } } } : true } },
      },
    });
    return NextResponse.json({ clients });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export const clientSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.literal(''), z.string().trim().email().max(191)]).optional(),
  nationality: z.string().trim().max(80).optional(),
  address: z.string().trim().max(255).optional(),
  idType: z.string().trim().max(40).optional(),
  idNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = clientSchema.extend({ allowPossibleDuplicate: z.boolean().optional() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Vérifiez le nom, le téléphone et l’adresse e-mail.' }, { status: 400 });
    const input = parsed.data;
    const scope = await authorizedScope('clients.create');
    const possibleDuplicates = await findPossibleClientDuplicates(db, input);
    if (possibleDuplicates.length && !input.allowPossibleDuplicate) {
      return NextResponse.json({
        error: 'Des fiches similaires existent déjà. Vérifiez-les avant de continuer.',
        possibleDuplicates,
      }, { status: 409 });
    }
    const client = await db.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          name: input.name,
          phone: input.phone || null,
          email: input.email || null,
          nationality: input.nationality || null,
          address: input.address || null,
          idType: input.idType || null,
          idNumber: input.idNumber || null,
          notes: input.notes || null,
          createdBy: scope.userId,
          createdByName: scope.name,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_CLIENT_CREATE',
          result: 'SUCCESS',
          targetId: created.id,
          details: {
            name: created.name,
            possibleDuplicateClientIds: input.allowPossibleDuplicate
              ? possibleDuplicates.map((duplicate) => duplicate.id)
              : [],
          },
        },
      });
      return created;
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

import { NextResponse } from 'next/server';
import { authorizedClientReadScope, authorizedScope } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

const maxDocumentBytes = 5 * 1024 * 1024;
const documentExtensions = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['application/pdf', 'pdf'],
]);

function failure(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Serves the ID scan privately: it is never written to a public folder. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await authorizedClientReadScope();
    const { id } = await params;
    const client = await db.client.findFirst({
      where: { id, ...(scope.roleCode === 'RECEPTIONIST' ? { createdBy: scope.userId } : {}), ...(scope.roleCode === 'HOTEL_ADMIN' ? { OR: [{ createdBy: scope.userId }, { reservations: { some: { room: { is: { assignedHotelAdminId: scope.userId, active: true } } } } }] } : {}) },
      select: { id: true, idDocumentMime: true, idDocumentData: true },
    });
    if (!client) throw new AppError(404, 'Client introuvable.');
    if (!client.idDocumentData || !client.idDocumentMime) {
      throw new AppError(404, 'Aucun scan de pièce d’identité n’est enregistré pour ce client.');
    }
    const extension = documentExtensions.get(client.idDocumentMime) ?? 'bin';
    return new NextResponse(new Uint8Array(client.idDocumentData), {
      headers: {
        'Content-Type': client.idDocumentMime,
        'Content-Disposition': `inline; filename="piece-identite-${client.id}.${extension}"`,
        'Content-Length': String(client.idDocumentData.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AppError) return failure(error.status, error.message);
    throw error;
  }
}

/** Records the scan or photo of the client's ID document (JPEG, PNG, WebP or PDF, 5 Mo max). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await authorizedScope('clients.update');
    const { id } = await params;
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError(400, 'Sélectionnez le scan ou la photo de la pièce d’identité.');
    }
    const mime = file.type.toLowerCase();
    if (!documentExtensions.has(mime)) {
      throw new AppError(415, 'Formats acceptés : photo JPEG, PNG, WebP ou PDF.');
    }
    if (file.size > maxDocumentBytes) {
      throw new AppError(413, 'Le scan de la pièce d’identité ne doit pas dépasser 5 Mo.');
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const document = await db.$transaction(async (tx) => {
      const existing = await tx.client.findFirst({
        where: { id },
        select: { id: true, name: true, idDocumentName: true },
      });
      if (!existing) throw new AppError(404, 'Client introuvable.');
      const updated = await tx.client.update({
        where: { id },
        data: {
          idDocumentName: file.name.trim().slice(0, 160) || `piece-identite-${existing.id}`,
          idDocumentMime: mime,
          idDocumentSize: file.size,
          idDocumentData: data,
          idDocumentUploadedAt: new Date(),
          idDocumentUploadedBy: scope.name,
        },
        select: {
          idDocumentName: true,
          idDocumentMime: true,
          idDocumentSize: true,
          idDocumentUploadedAt: true,
          idDocumentUploadedBy: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: scope.userId,
          action: 'RECEPTION_CLIENT_ID_DOCUMENT_SET',
          result: 'SUCCESS',
          targetId: existing.id,
          details: {
            client: existing.name,
            fileName: updated.idDocumentName,
            mime,
            size: file.size,
            replaced: Boolean(existing.idDocumentName),
          },
        },
      });
      return updated;
    });
    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof AppError) return failure(error.status, error.message);
    throw error;
  }
}


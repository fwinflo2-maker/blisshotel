import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;
type Context = { params: Promise<{ id: string }> };
function errorResponse(error: unknown) {
  const status = error instanceof AppError ? error.status : error instanceof z.ZodError ? 400 : 500;
  if (status === 500) console.error('[chat/messages] API failure:', error);
  const errorMessage = error instanceof AppError ? error.message : error instanceof z.ZodError ? 'Le message doit contenir entre 1 et 4 000 caractères.' : 'La messagerie est momentanément indisponible.';
  return NextResponse.json({ error: errorMessage }, { status });
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const participant = await db.chatParticipant.findUnique({ where: { conversationId_userId: { conversationId: id, userId: session.user.id } } });
    if (!participant || participant.status !== 'ACCEPTED') throw new AppError(403, 'Acceptez l’invitation pour accéder aux messages.');
    const messages = await db.chatMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, take: 300, include: { sender: { select: { id: true, name: true } } } });
    await db.chatParticipant.update({ where: { id: participant.id }, data: { lastReadAt: new Date() } });
    return NextResponse.json({ messages: messages.map((message) => ({ id: message.id, body: message.body, createdAt: message.createdAt.toISOString(), sender: message.sender })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(await request.json());
    const participant = await db.chatParticipant.findUnique({ where: { conversationId_userId: { conversationId: id, userId: session.user.id } } });
    if (!participant || participant.status !== 'ACCEPTED') throw new AppError(403, 'Vous devez accepter l’invitation avant d’écrire.');
    const message = await db.$transaction(async (transaction) => {
      const created = await transaction.chatMessage.create({ data: { conversationId: id, senderId: session.user.id, body }, include: { sender: { select: { id: true, name: true } } } });
      await transaction.chatConversation.update({ where: { id }, data: { updatedAt: new Date() } });
      return created;
    });
    return NextResponse.json({ message: { id: message.id, body: message.body, createdAt: message.createdAt.toISOString(), sender: message.sender } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

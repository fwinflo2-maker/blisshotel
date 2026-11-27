import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;
type Context = { params: Promise<{ id: string; userId: string }> };
function errorResponse(error: unknown) {
  const status = error instanceof AppError ? error.status : error instanceof z.ZodError ? 400 : 500;
  if (status === 500) console.error('[chat/members] API failure:', error);
  return NextResponse.json({ error: error instanceof AppError ? error.message : error instanceof z.ZodError ? 'Action invalide.' : 'La messagerie est momentanément indisponible.' }, { status });
}

export async function POST(_request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const { id, userId } = await params;
    const actor = await db.chatParticipant.findUnique({ where: { conversationId_userId: { conversationId: id, userId: session.user.id } }, include: { conversation: true } });
    if (!actor || actor.status !== 'ACCEPTED' || !actor.conversation.isGroup) throw new AppError(403, 'Seul un membre du groupe peut inviter un profil.');
    const contact = await db.user.findFirst({ where: { id: userId, active: true }, select: { id: true } });
    if (!contact || userId === session.user.id) throw new AppError(404, 'Ce profil est indisponible.');
    await db.chatParticipant.upsert({ where: { conversationId_userId: { conversationId: id, userId } }, create: { conversationId: id, userId, status: 'INVITED' }, update: { status: 'INVITED', joinedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const session = await requireSession();
    const { id, userId } = await params;
    if (userId !== session.user.id) throw new AppError(403, 'Vous ne pouvez répondre qu’à votre propre invitation.');
    const { decision } = z.object({ decision: z.enum(['ACCEPTED', 'DECLINED']) }).parse(await request.json());
    const membership = await db.chatParticipant.findUnique({ where: { conversationId_userId: { conversationId: id, userId } }, include: { conversation: true } });
    if (!membership || membership.status !== 'INVITED' || !membership.conversation.isGroup) throw new AppError(404, 'Invitation introuvable ou déjà traitée.');
    await db.chatParticipant.update({ where: { id: membership.id }, data: { status: decision, joinedAt: decision === 'ACCEPTED' ? new Date() : membership.joinedAt } });
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

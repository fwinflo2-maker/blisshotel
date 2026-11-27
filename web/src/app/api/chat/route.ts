import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';

export const instant = false;

function responseError(error: unknown) {
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: 'Vérifiez les informations saisies.' }, { status: 400 });
  console.error('[chat] API failure:', error);
  return NextResponse.json({ error: 'La messagerie est momentanément indisponible.' }, { status: 500 });
}

export async function GET() {
  try {
    const session = await requireSession();
    const [conversations, contacts] = await Promise.all([
      db.chatConversation.findMany({
        where: { participants: { some: { userId: session.user.id, status: { in: ['ACCEPTED', 'INVITED'] } } } },
        orderBy: { updatedAt: 'desc' }, take: 100,
        include: {
          participants: { include: { user: { select: { id: true, name: true, role: { select: { name: true } }, platformAdmin: true } } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { name: true } } } },
        },
      }),
      db.user.findMany({ where: { active: true, id: { not: session.user.id } }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: { select: { name: true } }, platformAdmin: true } }),
    ]);
    return NextResponse.json({
      userId: session.user.id,
      conversations: conversations.map((conversation) => {
        const mine = conversation.participants.find((participant) => participant.userId === session.user.id)!;
        const others = conversation.participants.filter((participant) => participant.userId !== session.user.id && participant.status !== 'DECLINED');
        const unread = conversation.messages[0] && conversation.messages[0].senderId !== session.user.id && (!mine.lastReadAt || conversation.messages[0].createdAt > mine.lastReadAt) ? 1 : 0;
        return {
          id: conversation.id, title: conversation.title, isGroup: conversation.isGroup,
          status: mine.status, updatedAt: conversation.updatedAt.toISOString(), unread,
          participants: others.map((participant) => ({ ...participant.user, role: participant.user.role?.name ?? (participant.user.platformAdmin ? 'Super administrateur' : 'Profil hôtelier') })),
          lastMessage: conversation.messages[0] ? { body: conversation.messages[0].body, sender: conversation.messages[0].sender.name, createdAt: conversation.messages[0].createdAt.toISOString() } : null,
        };
      }),
      contacts: contacts.map((contact) => ({ id: contact.id, name: contact.name, role: contact.role?.name ?? (contact.platformAdmin ? 'Super administrateur' : 'Profil hôtelier') })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return responseError(error); }
}

const createSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('direct'), userId: z.string().min(1) }),
  z.object({ type: z.literal('group'), title: z.string().trim().min(2).max(120), userIds: z.array(z.string().min(1)).max(50) }),
]);

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = createSchema.parse(await request.json());
    if (input.type === 'direct') {
      if (input.userId === session.user.id) throw new AppError(400, 'Vous ne pouvez pas ouvrir une conversation avec vous-même.');
      const contact = await db.user.findFirst({ where: { id: input.userId, active: true }, select: { id: true } });
      if (!contact) throw new AppError(404, 'Ce profil est indisponible.');
      const existing = await db.chatConversation.findMany({ where: { isGroup: false, participants: { some: { userId: session.user.id, status: 'ACCEPTED' } } }, include: { participants: true } });
      const match = existing.find((conversation) => conversation.participants.length === 2 && conversation.participants.every((participant) => participant.status === 'ACCEPTED') && conversation.participants.some((participant) => participant.userId === input.userId));
      if (match) return NextResponse.json({ id: match.id });
      const conversation = await db.chatConversation.create({ data: { createdById: session.user.id, participants: { create: [{ userId: session.user.id }, { userId: input.userId }] } } });
      return NextResponse.json({ id: conversation.id }, { status: 201 });
    }
    const userIds = [...new Set(input.userIds.filter((id) => id !== session.user.id))];
    const activeContacts = await db.user.findMany({ where: { id: { in: userIds }, active: true }, select: { id: true } });
    if (activeContacts.length !== userIds.length) throw new AppError(400, 'Un des profils sélectionnés est indisponible.');
    const conversation = await db.chatConversation.create({ data: {
      title: input.title, isGroup: true, createdById: session.user.id,
      participants: { create: [{ userId: session.user.id, status: 'ACCEPTED' }, ...userIds.map((userId) => ({ userId, status: 'INVITED' as const }))] },
    } });
    return NextResponse.json({ id: conversation.id }, { status: 201 });
  } catch (error) { return responseError(error); }
}

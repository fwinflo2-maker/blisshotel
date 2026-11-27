import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { hotelManagementApi } from '@/server/platform-admin';

export async function GET(request: Request) {
  return hotelManagementApi(async (actor) => {
    const params = new URL(request.url).searchParams;
    const platformAdminIds = actor.platformAdmin ? [] : (await db.user.findMany({ where: { platformAdmin: true }, select: { id: true } })).map(({ id }) => id);
    const rawPage = Number(params.get('page') ?? 1);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10000) : 1;
    const from = params.get('from');
    const to = params.get('to');
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const validFrom = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined;
    const validTo = toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined;
    if ((from && !validFrom) || (to && !validTo) || (validFrom && validTo && validFrom > validTo)) {
      return NextResponse.json({ error: 'Période de filtrage invalide.' }, { status: 400 });
    }
    const result = params.get('result');
    if (result && !['SUCCESS', 'FAILURE', 'DENIED'].includes(result)) {
      return NextResponse.json({ error: 'Résultat de filtre invalide.' }, { status: 400 });
    }
    const where = {
      ...(!actor.platformAdmin ? { OR: [{ actorId: null }, { actorId: { notIn: platformAdminIds } }] } : {}),
      ...(params.get('actorId') ? { actorId: params.get('actorId')! } : {}),
      ...(params.get('action') ? { action: { contains: params.get('action')! } } : {}),
      ...(result ? { result } : {}),
      ...(validFrom || validTo
        ? { createdAt: { ...(validFrom ? { gte: validFrom } : {}), ...(validTo ? { lte: validTo } : {}) } }
        : {}),
    };
    const [events, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
      }),
      db.auditLog.count({ where }),
    ]);
    return NextResponse.json({ events, total, page, pageSize: 50 });
  });
}

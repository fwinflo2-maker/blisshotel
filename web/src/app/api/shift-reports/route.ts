import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedScope, requireSession } from '@/server/auth';
import { AppError } from '@/server/policy';
import { db } from '@/server/db';
import { hotelConfiguration } from '@/server/hotel';
import { parseDateOnly } from '@/server/reception';
import { serializeShiftReport, shiftReportInclude } from '@/server/shift-reports';

export const instant = false;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const shiftTypeSchema = z.enum(['DAY', 'NIGHT']);

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (!session.user.platformAdmin) await authorizedScope('shift_reports.view');
    const roleCode = session.user.role?.code;
    const canViewAllReports = session.user.platformAdmin || roleCode === 'OWNER' || roleCode === 'HOTEL_ADMIN';

    const params = new URL(request.url).searchParams;
    const fromText = params.get('from');
    const toText = params.get('to');
    const shiftType = params.get('shiftType');
    if ((fromText && !dateSchema.safeParse(fromText).success) || (toText && !dateSchema.safeParse(toText).success)) {
      return NextResponse.json({ error: 'Période de consultation invalide.' }, { status: 400 });
    }
    const parsedShiftType = shiftType ? shiftTypeSchema.safeParse(shiftType) : null;
    if (parsedShiftType && !parsedShiftType.success) {
      return NextResponse.json({ error: 'Type de service invalide.' }, { status: 400 });
    }

    const from = fromText ? parseDateOnly(fromText) : undefined;
    const to = toText ? parseDateOnly(toText) : undefined;
    if (from && to && from > to) return NextResponse.json({ error: 'Période de consultation invalide.' }, { status: 400 });

    const rawPage = Number(params.get('page') ?? 1);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10000) : 1;
    const where = {
      ...(!canViewAllReports ? { userId: session.userId } : {}),
      ...(parsedShiftType?.success ? { shiftType: parsedShiftType.data } : {}),
      ...(from || to ? { shiftDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const [reports, total, hotel] = await Promise.all([
      db.receptionShiftReport.findMany({
        where,
        include: shiftReportInclude,
        orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 25,
        take: 25,
      }),
      db.receptionShiftReport.count({ where }),
      hotelConfiguration(),
    ]);

    return NextResponse.json({
      reports: reports.map(serializeShiftReport),
      total,
      page,
      pageSize: 25,
      hotel: { name: hotel.name, currency: hotel.currency, timezone: hotel.timezone },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

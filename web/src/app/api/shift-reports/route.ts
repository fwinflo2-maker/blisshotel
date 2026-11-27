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
    if (!session.user.platformAdmin && !['GENERAL_MANAGER', 'BAR_SERVER'].includes(session.user.role?.code ?? '')) await authorizedScope('shift_reports.view');
    const roleCode = session.user.role?.code;
    const canViewAllReports = session.user.platformAdmin || roleCode === 'OWNER' || roleCode === 'HOTEL_ADMIN' || roleCode === 'GENERAL_MANAGER';

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

    const receptionReports = reports.filter((report) => {
      const summary = report.summary as unknown as { department?: string };
      return summary.department !== 'BAR_RESTAURANT';
    });
    const reportUserIds = [...new Set(receptionReports.map((report) => report.userId))];
    const minimumStart = receptionReports.length ? new Date(Math.min(...receptionReports.map((report) => report.startedAt.getTime()))) : new Date(0);
    const maximumEnd = receptionReports.length ? new Date(Math.max(...receptionReports.map((report) => report.endedAt.getTime()))) : new Date(0);
    const stayActivity = receptionReports.length ? await db.stay.findMany({
      where: {
        OR: [
          { checkedInBy: { in: reportUserIds }, checkInRecordedAt: { gte: minimumStart, lte: maximumEnd } },
          { checkedOutBy: { in: reportUserIds }, checkOutRecordedAt: { gte: minimumStart, lte: maximumEnd } },
        ],
      },
      select: {
        checkedInBy: true,
        checkInRecordedAt: true,
        checkedOutBy: true,
        checkOutRecordedAt: true,
        reservation: { select: { reference: true, client: { select: { name: true } }, room: { select: { number: true } } } },
      },
    }) : [];

    return NextResponse.json({
      reports: reports.map((report) => {
        const serialized = serializeShiftReport(report);
        const summary = report.summary as unknown as { department?: string; operations?: { checkIns?: number; checkOuts?: number }; [key: string]: unknown };
        if (summary.department === 'BAR_RESTAURANT') return serialized;
        const checkIns = stayActivity
          .filter((stay) => stay.checkedInBy === report.userId && stay.checkInRecordedAt
            && stay.checkInRecordedAt >= report.startedAt && stay.checkInRecordedAt <= report.endedAt)
          .map((stay) => ({ reference: stay.reservation.reference, clientName: stay.reservation.client.name, roomNumber: stay.reservation.room?.number ?? null, recordedAt: stay.checkInRecordedAt!.toISOString() }));
        const checkOuts = stayActivity
          .filter((stay) => stay.checkedOutBy === report.userId && stay.checkOutRecordedAt
            && stay.checkOutRecordedAt >= report.startedAt && stay.checkOutRecordedAt <= report.endedAt)
          .map((stay) => ({ reference: stay.reservation.reference, clientName: stay.reservation.client.name, roomNumber: stay.reservation.room?.number ?? null, recordedAt: stay.checkOutRecordedAt!.toISOString() }));
        return {
          ...serialized,
          summary: {
            ...summary,
            operations: {
              ...(summary.operations ?? {}),
              checkIns: Math.max(checkIns.length, summary.operations?.checkIns ?? 0),
              checkOuts: Math.max(checkOuts.length, summary.operations?.checkOuts ?? 0),
            },
            stayOperations: { checkIns, checkOuts },
          },
        };
      }),
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

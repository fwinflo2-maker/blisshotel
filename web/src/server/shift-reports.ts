import { Prisma } from '@prisma/client';

export const shiftReportInclude = {
  user: { select: { id: true, name: true } },
  cashSession: {
    select: {
      id: true,
      openingAmount: true,
      expectedCash: true,
      countedAmount: true,
      variance: true,
    },
  },
  expenses: {
    orderBy: { createdAt: 'asc' },
    include: { paymentMethod: { select: { code: true, name: true } } },
  },
} satisfies Prisma.ReceptionShiftReportInclude;

type IncludedShiftReport = Prisma.ReceptionShiftReportGetPayload<{ include: typeof shiftReportInclude }>;

export function serializeShiftReport(report: IncludedShiftReport) {
  return {
    ...report,
    shiftDate: report.shiftDate.toISOString().slice(0, 10),
    startedAt: report.startedAt.toISOString(),
    endedAt: report.endedAt.toISOString(),
    createdAt: report.createdAt.toISOString(),
    cashSession: {
      ...report.cashSession,
      openingAmount: report.cashSession.openingAmount.toFixed(2),
      expectedCash: report.cashSession.expectedCash?.toFixed(2) ?? null,
      countedAmount: report.cashSession.countedAmount?.toFixed(2) ?? null,
      variance: report.cashSession.variance?.toFixed(2) ?? null,
    },
    expenses: report.expenses.map((expense) => ({
      ...expense,
      amount: expense.amount.toFixed(2),
      createdAt: expense.createdAt.toISOString(),
    })),
  };
}

export type ShiftReportExpense = {
  id: string;
  description: string;
  amount: string;
  paymentMethod: { code: string; name: string };
};

export type ShiftReport = {
  id: string;
  shiftType: 'DAY' | 'NIGHT';
  shiftDate: string;
  startedAt: string;
  endedAt: string;
  createdAt: string;
  user: { id: string; name: string };
  summary: {
    operations: {
      reservationsCreated: number;
      reservationsConfirmed: number;
      reservationsCancelled: number;
      checkIns: number;
      checkOuts: number;
    };
    payments: {
      count: number;
      total: string;
      byMethod: { code: string; name: string; amount: string }[];
    };
    cash: {
      openingAmount: string;
      cashReceived: string;
      cashExpenses: string;
      totalExpenses: string;
      expectedCash: string;
      countedAmount: string;
      variance: string;
    };
    restaurant?: {
      ordersCount: number;
      total: string;
      foodTotal: string;
      drinkTotal: string;
      breakfastTotal: string;
    };
    rooms: {
      status: { status: string; count: number }[];
      housekeeping: { status: string; count: number }[];
    };
    openFolios: { count: number; balance: string };
  };
  incidentNotes: string | null;
  handoverNotes: string | null;
  expenses: ShiftReportExpense[];
  cashSession: {
    id: string;
    openingAmount: string;
    expectedCash: string | null;
    countedAmount: string | null;
    variance: string | null;
  };
};

export type ShiftExpenseDraft = {
  id: string;
  description: string;
  amount: string;
  paymentMethodId: string;
};

export type ShiftReportCloseInput = {
  shiftType: ShiftReport['shiftType'];
  incidentNotes: string;
  handoverNotes: string;
  expenses: Omit<ShiftExpenseDraft, 'id'>[];
};

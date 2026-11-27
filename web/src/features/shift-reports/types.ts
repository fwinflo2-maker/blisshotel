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
    department?: 'RECEPTION' | 'BAR_RESTAURANT';
    operations: {
      reservationsCreated: number;
      reservationsConfirmed: number;
      reservationsCancelled: number;
      checkIns: number;
      checkOuts: number;
    };
    stayOperations?: {
      checkIns: { reference: string; clientName: string; roomNumber: string | null; recordedAt: string }[];
      checkOuts: { reference: string; clientName: string; roomNumber: string | null; recordedAt: string }[];
    };
    reservations?: {
      reservationsCount: number;
      clientsCount: number;
      paidClients: number;
      unpaidClients: number;
      clients: { name: string; registeredBy: string; references: string[]; rooms?: string[]; paymentStatus: 'PAYE' | 'NON_PAYE' }[];
    };
    invoicesSettled?: {
      count: number;
      clients: { invoiceNumber: string; clientName: string; registeredBy: string; reference: string; roomNumber?: string | null; settledAt: string }[];
    };
    payments: {
      count: number;
      total: string;
      byMethod: { code: string; name: string; amount: string }[];
    };
    commissions?: { count: number; total: string; registeredBy: string; entries?: { reservationReference: string; amount: string; createdAt: string }[] };
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
      servedCount?: number;
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

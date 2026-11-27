export type ShiftMoneyMovement = { amount: string; paymentMethodCode: string };

function toCents(value: string) {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(unsigned)) throw new RangeError('Montant invalide.');
  const [whole, fraction = ''] = unsigned.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new RangeError('Montant hors limite.');
  return negative ? -cents : cents;
}

function fromCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function calculateCashDrawer(
  openingAmount: string,
  payments: ShiftMoneyMovement[],
  expenses: ShiftMoneyMovement[],
) {
  const cashPayments = payments.filter((movement) => movement.paymentMethodCode === 'CASH');
  const cashReceivedCents = cashPayments
    .filter((movement) => toCents(movement.amount) > 0)
    .reduce((total, movement) => total + toCents(movement.amount), 0);
  const cashOutflowFromPaymentsCents = cashPayments
    .filter((movement) => toCents(movement.amount) < 0)
    .reduce((total, movement) => total - toCents(movement.amount), 0);
  const cashExpensesCents = expenses
    .filter((movement) => movement.paymentMethodCode === 'CASH')
    .reduce((total, movement) => total + toCents(movement.amount), cashOutflowFromPaymentsCents);
  const availableCents = toCents(openingAmount) + cashReceivedCents;
  return {
    cashReceived: fromCents(cashReceivedCents),
    cashExpenses: fromCents(cashExpensesCents),
    expectedCash: fromCents(availableCents - cashExpensesCents),
    canCoverExpenses: cashExpensesCents <= availableCents,
  };
}

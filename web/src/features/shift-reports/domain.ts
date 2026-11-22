export type ShiftMoneyMovement = { amount: string; paymentMethodCode: string };

function toCents(value: string) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) throw new RangeError('Montant invalide.');
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new RangeError('Montant hors limite.');
  return cents;
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
  const cashReceivedCents = payments
    .filter((movement) => movement.paymentMethodCode === 'CASH')
    .reduce((total, movement) => total + toCents(movement.amount), 0);
  const cashExpensesCents = expenses
    .filter((movement) => movement.paymentMethodCode === 'CASH')
    .reduce((total, movement) => total + toCents(movement.amount), 0);
  const availableCents = toCents(openingAmount) + cashReceivedCents;
  return {
    cashReceived: fromCents(cashReceivedCents),
    cashExpenses: fromCents(cashExpensesCents),
    expectedCash: fromCents(availableCents - cashExpensesCents),
    canCoverExpenses: cashExpensesCents <= availableCents,
  };
}

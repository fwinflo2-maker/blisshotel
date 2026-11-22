import { describe, expect, it } from 'vitest';
import { calculateCashDrawer } from './domain';

describe('clôture de caisse des rapports de service', () => {
  it('déduit uniquement les dépenses et encaissements en espèces, sans erreur d’arrondi', () => {
    expect(calculateCashDrawer(
      '100.00',
      [
        { amount: '25.40', paymentMethodCode: 'CASH' },
        { amount: '75.00', paymentMethodCode: 'MOBILE_MONEY' },
      ],
      [
        { amount: '9.99', paymentMethodCode: 'CASH' },
        { amount: '11.01', paymentMethodCode: 'MOBILE_MONEY' },
      ],
    )).toEqual({
      cashReceived: '25.40',
      cashExpenses: '9.99',
      expectedCash: '115.41',
      canCoverExpenses: true,
    });
  });

  it('signale une dépense en espèces supérieure au solde disponible', () => {
    expect(calculateCashDrawer(
      '50.00',
      [{ amount: '10.00', paymentMethodCode: 'CASH' }],
      [{ amount: '60.01', paymentMethodCode: 'CASH' }],
    ).canCoverExpenses).toBe(false);
  });
});

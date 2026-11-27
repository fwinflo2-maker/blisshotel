import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { amountAtXafRate, amountFromXafRate } from './currency-arithmetic';

describe('currency conversion arithmetic', () => {
  it('uses the fixed EUR rate and rounds half-up to cents', () => {
    expect(amountAtXafRate('1', new Prisma.Decimal('655.957')).toFixed(2)).toBe('655.96');
    expect(amountAtXafRate('10.25', new Prisma.Decimal('655.957')).toFixed(2)).toBe('6723.56');
  });

  it('converts an XAF amount back to a two-decimal input amount', () => {
    expect(amountFromXafRate('6723.56', new Prisma.Decimal('655.957')).toFixed(2)).toBe('10.25');
  });
});

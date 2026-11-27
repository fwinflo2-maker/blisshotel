import { describe, expect, it } from 'vitest';
import { hotelCurrencies, hotelCurrencySchema, parseUsdXafRate } from './currency';

describe('hotel currency configuration', () => {
  it.each(hotelCurrencies)('accepts %s', (currency) => {
    expect(hotelCurrencySchema.safeParse(currency).success).toBe(true);
  });

  describe('USD/XAF exchange rate validation', () => {
    it('accepts a current rate and rounds it to six decimal places', () => {
      const now = new Date('2026-11-24T12:00:00.000Z');
      const result = parseUsdXafRate({
        result: 'success',
        time_last_update_unix: now.getTime() / 1000,
        rates: { XAF: 612.3456789 },
      }, now);

      expect(result.xafPerUnit).toBe('612.345679');
      expect(result.effectiveAt.toISOString()).toBe(now.toISOString());
    });

    it('rejects missing and stale XAF rates', () => {
      const now = new Date('2026-11-24T12:00:00.000Z');
      expect(() => parseUsdXafRate({
        result: 'success',
        time_last_update_unix: now.getTime() / 1000,
        rates: { EUR: 0.9 },
      }, now)).toThrow('USD/XAF exploitable');
      expect(() => parseUsdXafRate({
        result: 'success',
        time_last_update_unix: (now.getTime() - 37 * 60 * 60 * 1000) / 1000,
        rates: { XAF: 600 },
      }, now)).toThrow('trop ancien');
    });
  });

  it('rejects currencies that are not configured as supported', () => {
    expect(hotelCurrencySchema.safeParse('GBP').success).toBe(false);
  });
});

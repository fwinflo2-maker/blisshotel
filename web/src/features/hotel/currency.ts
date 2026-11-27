import { z } from 'zod';

export const hotelCurrencies = ['XAF', 'EUR', 'USD'] as const;

export type HotelCurrency = (typeof hotelCurrencies)[number];

export const hotelCurrencySchema = z.enum(hotelCurrencies);

export const hotelCurrencyLabels: Record<HotelCurrency, string> = {
  XAF: 'Franc CFA (XAF)',
  EUR: 'Euro (EUR)',
  USD: 'Dollar américain (USD)',
};

export function parseUsdXafRate(payload: unknown, now = new Date()) {
  if (!payload || typeof payload !== 'object') throw new Error('Le taux USD/XAF reçu est invalide.');
  const data = payload as { result?: unknown; time_last_update_unix?: unknown; rates?: Record<string, unknown> };
  const rate = data.rates?.XAF;
  const timestamp = data.time_last_update_unix;
  if (
    data.result !== 'success'
    || typeof rate !== 'number'
    || !Number.isFinite(rate)
    || rate <= 0
    || typeof timestamp !== 'number'
    || !Number.isFinite(timestamp)
  ) throw new Error('Le fournisseur ne renvoie pas de taux USD/XAF exploitable.');
  const effectiveAt = new Date(timestamp * 1000);
  if (
    !Number.isFinite(effectiveAt.getTime())
    || effectiveAt.getTime() > now.getTime() + 5 * 60 * 1000
    || now.getTime() - effectiveAt.getTime() > 36 * 60 * 60 * 1000
  ) throw new Error('Le taux USD/XAF du fournisseur est trop ancien.');
  return { xafPerUnit: rate.toFixed(6), effectiveAt };
}

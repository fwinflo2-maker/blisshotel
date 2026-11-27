import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { AppError } from './policy';
import { parseUsdXafRate } from '@/features/hotel/currency';
import { amountAtXafRate, amountFromXafRate } from '@/features/hotel/currency-arithmetic';

const XAF_PER_EUR = new Prisma.Decimal('655.957');
const RATE_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const RATE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const RETRY_RATE_AFTER_MS = 15 * 60 * 1000;

type Rate = { xafPerUnit: Prisma.Decimal; effectiveAt: Date; source: string };
let usdRateCache: Rate | null = null;
let lastUsdRateAttemptAt = 0;
let lastUsdRateError: AppError | null = null;

function parseUsdRate(payload: unknown, now = new Date()): Rate {
  try {
    const parsed = parseUsdXafRate(payload, now);
    return {
      xafPerUnit: new Prisma.Decimal(parsed.xafPerUnit),
      effectiveAt: parsed.effectiveAt,
      source: 'open.er-api.com',
    };
  } catch (error) {
    throw new AppError(503, error instanceof Error ? error.message : 'Le taux USD/XAF reçu est invalide.');
  }
}

async function loadUsdRate(): Promise<Rate> {
  const now = new Date();
  if (
    usdRateCache
    && now.getTime() - lastUsdRateAttemptAt < RETRY_RATE_AFTER_MS
    && now.getTime() - usdRateCache.effectiveAt.getTime() < RATE_MAX_AGE_MS
  ) return usdRateCache;
  if (lastUsdRateError && now.getTime() - lastUsdRateAttemptAt < RETRY_RATE_AFTER_MS) {
    throw lastUsdRateError;
  }

  const cachedRecord = await db.currencyRate.findUnique({ where: { currency: 'USD' } });
  const cached = cachedRecord
    ? { xafPerUnit: cachedRecord.xafPerUnit, effectiveAt: cachedRecord.effectiveAt, source: cachedRecord.source }
    : usdRateCache;
  if (cached && now.getTime() - cached.effectiveAt.getTime() < RATE_REFRESH_AFTER_MS) {
    usdRateCache = cached;
    lastUsdRateAttemptAt = now.getTime();
    lastUsdRateError = null;
    return { xafPerUnit: cached.xafPerUnit, effectiveAt: cached.effectiveAt, source: cached.source };
  }

  lastUsdRateAttemptAt = now.getTime();
  let freshRate: Rate;
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new AppError(503, `Le fournisseur de taux USD/XAF répond HTTP ${response.status}.`);
    freshRate = parseUsdRate(await response.json());
  } catch (error) {
    const rateError = error instanceof AppError
      ? error
      : new AppError(503, 'Le taux USD/XAF est indisponible. Réessayez lorsque la connexion sera rétablie.');
    lastUsdRateError = rateError;
    if (error instanceof AppError) {
      if (cached && now.getTime() - cached.effectiveAt.getTime() < RATE_MAX_AGE_MS) {
        usdRateCache = cached;
        return cached;
      }
    } else if (cached && now.getTime() - cached.effectiveAt.getTime() < RATE_MAX_AGE_MS) {
      usdRateCache = cached;
      return cached;
    }
    throw rateError;
  }

  await db.currencyRate.upsert({
    where: { currency: 'USD' },
    create: {
      currency: 'USD',
      xafPerUnit: freshRate.xafPerUnit,
      effectiveAt: freshRate.effectiveAt,
      source: freshRate.source,
    },
    update: {
      xafPerUnit: freshRate.xafPerUnit,
      effectiveAt: freshRate.effectiveAt,
      source: freshRate.source,
      fetchedAt: now,
    },
  });
  usdRateCache = freshRate;
  lastUsdRateError = null;
  return freshRate;
}

async function rateFor(currency: string): Promise<Rate> {
  if (currency === 'XAF') return { xafPerUnit: new Prisma.Decimal(1), effectiveAt: new Date(0), source: 'fixed' };
  if (currency === 'EUR') return { xafPerUnit: XAF_PER_EUR, effectiveAt: new Date(0), source: 'fixed' };
  if (currency === 'USD') return loadUsdRate();
  throw new AppError(400, 'La devise configurée n’est pas prise en charge.');
}

export async function convertToXaf(value: string | number | Prisma.Decimal, currency: string) {
  const rate = await rateFor(currency);
  const converted = amountAtXafRate(value, rate.xafPerUnit);
  if (converted.gt('99999999.99')) {
    throw new AppError(400, 'Le montant converti en XAF dépasse la limite autorisée.');
  }
  return converted;
}

export async function convertFromXaf(value: string | number | Prisma.Decimal, currency: string) {
  const rate = await rateFor(currency);
  return amountFromXafRate(value, rate.xafPerUnit);
}

export async function currencyRateSnapshot(currency: string) {
  const rate = await rateFor(currency);
  return {
    currency,
    xafPerUnit: rate.xafPerUnit.toFixed(6),
    effectiveAt: rate.source === 'fixed' ? null : rate.effectiveAt.toISOString(),
    source: rate.source,
  };
}


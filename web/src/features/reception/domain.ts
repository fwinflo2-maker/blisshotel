export function nightsBetween(checkIn: string, checkOut: string) {
  const start = Date.parse(`${checkIn}T00:00:00.000Z`);
  const end = Date.parse(`${checkOut}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 86_400_000);
}

function amountInCents(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function isRateOutsideRange(rate: string, minimum: string, maximum: string) {
  const amount = amountInCents(rate);
  return !Number.isFinite(amount) || amount < amountInCents(minimum) || amount > amountInCents(maximum);
}

const roomNightlyRateRanges: Record<string, [string, string]> = {
  '101': ['30000.00', '40000.00'],
  '106': ['25000.00', '30000.00'],
  '107': ['20000.00', '20000.00'],
  '201': ['25000.00', '35000.00'],
  '202': ['15000.00', '20000.00'],
  '203': ['25000.00', '30000.00'],
  '205': ['25000.00', '30000.00'],
  '206': ['20000.00', '30000.00'],
  '207': ['25000.00', '30000.00'],
  '208': ['25000.00', '30000.00'],
  '301': ['30000.00', '35000.00'],
  '302': ['25000.00', '30000.00'],
  '303': ['30000.00', '40000.00'],
  '304': ['20000.00', '25000.00'],
  '305': ['35000.00', '40000.00'],
  '306': ['30000.00', '35000.00'],
  '307': ['30000.00', '35000.00'],
  '308': ['25000.00', '30000.00'],
  '401': ['30000.00', '40000.00'],
  '402': ['30000.00', '35000.00'],
  '403': ['30000.00', '40000.00'],
  '404': ['20000.00', '25000.00'],
  '405': ['35000.00', '40000.00'],
  '406': ['30000.00', '35000.00'],
  '440': ['50000.00', '80000.00'],
};

export function nightlyRateRangeForRoom(roomNumber: string) {
  const range = roomNightlyRateRanges[roomNumber];
  return range ? { minimum: range[0], maximum: range[1] } : null;
}

export function nightlyRatePolicy(minimum: string, maximum: string) {
  const width = amountInCents(maximum) - amountInCents(minimum);
  if (width === 500_000) {
    return {
      minimum,
      maximum: minimum,
      optionalMeal: { code: 'BREAKFAST' as const, name: 'Petit-déjeuner', price: '5000.00' },
    };
  }
  if (width === 1_000_000) {
    const roomMaximum = amountInCents(minimum) + 500_000;
    return {
      minimum,
      maximum: `${Math.floor(roomMaximum / 100)}.${String(roomMaximum % 100).padStart(2, '0')}`,
      optionalMeal: { code: 'LUNCH' as const, name: 'Déjeuner', price: '5000.00' },
    };
  }
  return { minimum, maximum, optionalMeal: null };
}

export function dateRangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
) {
  return firstStart < secondEnd && firstEnd > secondStart;
}

export function timeRangesOverlap(firstStart: Date, firstEnd: Date, secondStart: Date, secondEnd: Date) {
  return firstStart < secondEnd && firstEnd > secondStart;
}

export function siestaEndAt(actualCheckIn: Date) {
  return new Date(actualCheckIn.getTime() + 210 * 60_000);
}

export type StatPeriod = 'day' | 'week' | 'month' | 'year';

/** Calendar-period start, computed in the property's local timezone. */
export function periodStartInTimeZone(period: StatPeriod, now: Date, timeZone: string) {
  const todayKey = dateKeyInTimeZone(now, timeZone);
  const startDay = new Date(`${todayKey}T00:00:00.000Z`);
  if (period === 'week') {
    const mondayOffset = (startDay.getUTCDay() + 6) % 7;
    startDay.setUTCDate(startDay.getUTCDate() - mondayOffset);
  } else if (period === 'month') {
    startDay.setUTCDate(1);
  } else if (period === 'year') {
    startDay.setUTCMonth(0, 1);
  }
  return localDateTimeToUtc(`${startDay.toISOString().slice(0, 10)}T00:00`, timeZone);
}

export function dateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function localDateTimeToUtc(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError('Date et heure invalides.');
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const values = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const [year, month, day, hour, minute] = values;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const normalized = new Date(target);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
    || normalized.getUTCHours() !== hour
    || normalized.getUTCMinutes() !== minute
  ) throw new RangeError('Date et heure invalides.');

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
    const renderedAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    const difference = target - renderedAsUtc;
    if (difference === 0) return new Date(candidate);
    candidate += difference;
  }
  throw new RangeError('Cette heure locale n’existe pas dans le fuseau horaire de l’hôtel.');
}

export function calculateBalanceCents(totalCents: number, paidCents: number) {
  return Math.max(0, totalCents - paidCents);
}

export function canCheckout(balanceCents: number, allowCheckoutWithBalance: boolean) {
  return allowCheckoutWithBalance || balanceCents <= 0;
}

export type PaymentRequestKey = {
  folioId: string | null;
  clientId?: string | null;
  paymentMethodId: string;
  amount: string;
  inputAmount?: string | null;
  inputCurrency?: string | null;
  reference: string | null;
  description?: string | null;
  receivedBy: string;
};

export function isSamePaymentRequest(existing: PaymentRequestKey, requested: PaymentRequestKey) {
  return existing.folioId === requested.folioId
    && (existing.clientId ?? null) === (requested.clientId ?? null)
    && existing.paymentMethodId === requested.paymentMethodId
    && (existing.inputAmount != null && requested.inputAmount != null
      ? amountInCents(existing.inputAmount) === amountInCents(requested.inputAmount)
        && (existing.inputCurrency ?? 'XAF') === (requested.inputCurrency ?? 'XAF')
      : amountInCents(existing.amount) === amountInCents(requested.amount))
    && existing.reference === requested.reference
    && (existing.description ?? null) === (requested.description ?? null)
    && existing.receivedBy === requested.receivedBy;
}

export type PerformanceGranularity = 'day' | 'week' | 'month' | 'year';

export type ReceptionistClosureSource = {
  id: string;
  userId: string;
  closedAt: string;
  shiftType: 'DAY' | 'NIGHT' | null;
  sales: string;
  paymentsCount: number;
  variance: string | null;
};

export type ReceptionistPerformanceSource = {
  receptionists: { id: string; name: string }[];
  clients: { createdBy: string | null; createdAt: string }[];
  closures: ReceptionistClosureSource[];
  granularity: PerformanceGranularity;
  timezone: string;
};

export type ReceptionistPerformance = {
  granularity: PerformanceGranularity;
  staff: {
    id: string;
    name: string;
    clientsCreated: number;
    closedSessions: number;
    paymentsCount: number;
    sales: string;
    periods: {
      key: string;
      clientsCreated: number;
      closedSessions: number;
      paymentsCount: number;
      sales: string;
    }[];
    closures: {
      id: string;
      closedAt: string;
      shiftType: 'DAY' | 'NIGHT' | null;
      sales: string;
      paymentsCount: number;
      variance: string | null;
    }[];
  }[];
};

type PerformanceAccumulator = {
  id: string;
  name: string;
  clientsCreated: number;
  closedSessions: number;
  paymentsCount: number;
  salesMinor: number;
  periods: Map<string, { clientsCreated: number; closedSessions: number; paymentsCount: number; salesMinor: number }>;
  closures: ReceptionistPerformance['staff'][number]['closures'];
};

export function isPerformanceGranularity(value: string | null): value is PerformanceGranularity {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year';
}

function minorUnits(value: string) {
  return Math.round(Number(value) * 100);
}

function decimalAmount(value: number) {
  return (value / 100).toFixed(2);
}

function hotelDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: 'year' | 'month' | 'day') => parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) throw new Error('Impossible de déterminer la date locale de l’hôtel.');
  return `${year}-${month}-${day}`;
}

function periodKey(date: Date, granularity: PerformanceGranularity, timezone: string) {
  const localDate = hotelDateKey(date, timezone);
  if (granularity === 'day') return localDate;
  if (granularity === 'year') return localDate.slice(0, 4);
  if (granularity === 'month') return localDate.slice(0, 7);
  const weekStart = new Date(`${localDate}T12:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  return weekStart.toISOString().slice(0, 10);
}

export function summarizeReceptionistPerformance(source: ReceptionistPerformanceSource): ReceptionistPerformance {
  const staff = new Map<string, PerformanceAccumulator>(source.receptionists.map((person) => [person.id, {
    id: person.id,
    name: person.name,
    clientsCreated: 0,
    closedSessions: 0,
    paymentsCount: 0,
    salesMinor: 0,
    periods: new Map<string, { clientsCreated: number; closedSessions: number; paymentsCount: number; salesMinor: number }>(),
    closures: [] as ReceptionistPerformance['staff'][number]['closures'],
  }]));

  const getPeriod = (person: PerformanceAccumulator, key: string) => {
    let period = person.periods.get(key);
    if (!period) {
      period = { clientsCreated: 0, closedSessions: 0, paymentsCount: 0, salesMinor: 0 };
      person.periods.set(key, period);
    }
    return period;
  };

  for (const client of source.clients) {
    if (!client.createdBy) continue;
    const person = staff.get(client.createdBy);
    if (!person) continue;
    person.clientsCreated++;
    getPeriod(person, periodKey(new Date(client.createdAt), source.granularity, source.timezone)).clientsCreated++;
  }

  for (const closure of source.closures) {
    const person = staff.get(closure.userId);
    if (!person) continue;
    const key = periodKey(new Date(closure.closedAt), source.granularity, source.timezone);
    const period = getPeriod(person, key);
    const amount = minorUnits(closure.sales);
    person.salesMinor += amount;
    person.closedSessions++;
    person.paymentsCount += closure.paymentsCount;
    period.salesMinor += amount;
    period.closedSessions++;
    period.paymentsCount += closure.paymentsCount;
    person.closures.push({
      id: closure.id,
      closedAt: closure.closedAt,
      shiftType: closure.shiftType,
      sales: closure.sales,
      paymentsCount: closure.paymentsCount,
      variance: closure.variance,
    });
  }

  return {
    granularity: source.granularity,
    staff: [...staff.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((person) => ({
        id: person.id,
        name: person.name,
        clientsCreated: person.clientsCreated,
        closedSessions: person.closedSessions,
        paymentsCount: person.paymentsCount,
        sales: decimalAmount(person.salesMinor),
        periods: [...person.periods.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, period]) => ({
          key,
          clientsCreated: period.clientsCreated,
          closedSessions: period.closedSessions,
          paymentsCount: period.paymentsCount,
          sales: decimalAmount(period.salesMinor),
        })),
        closures: person.closures.sort((a, b) => b.closedAt.localeCompare(a.closedAt)),
      })),
  };
}

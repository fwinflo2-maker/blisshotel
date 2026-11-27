import { describe, expect, it } from 'vitest';
import { summarizeReceptionistPerformance } from './domain';

describe('performances de la réception', () => {
  const source = {
    receptionists: [{ id: 'alice', name: 'Alice' }, { id: 'bruno', name: 'Bruno' }],
    clients: [
      { createdBy: 'alice', createdAt: '2026-11-25T23:15:00.000Z' },
      { createdBy: 'alice', createdAt: '2026-11-26T08:00:00.000Z' },
      { createdBy: 'bruno', createdAt: '2026-11-26T10:00:00.000Z' },
      { createdBy: null, createdAt: '2026-11-26T10:00:00.000Z' },
    ],
    closures: [
      { id: 'night', userId: 'alice', closedAt: '2026-11-25T23:30:00.000Z', shiftType: 'NIGHT' as const, sales: '125.10', paymentsCount: 2, variance: '0.00' },
      { id: 'day', userId: 'alice', closedAt: '2026-11-26T14:00:00.000Z', shiftType: 'DAY' as const, sales: '0.20', paymentsCount: 1, variance: '-0.10' },
      { id: 'other-user', userId: 'former-user', closedAt: '2026-11-26T14:00:00.000Z', shiftType: null, sales: '999.00', paymentsCount: 9, variance: null },
    ],
    timezone: 'Africa/Brazzaville',
  };

  it('attribue ventes, clôtures et créations de clients au bon réceptionniste et à la date locale', () => {
    const result = summarizeReceptionistPerformance({ ...source, granularity: 'day' });

    expect(result.staff).toEqual([
      {
        id: 'alice',
        name: 'Alice',
        clientsCreated: 2,
        closedSessions: 2,
        paymentsCount: 3,
        sales: '125.30',
        periods: [{
          key: '2026-11-26',
          clientsCreated: 2,
          closedSessions: 2,
          paymentsCount: 3,
          sales: '125.30',
        }],
        closures: [
          { id: 'day', closedAt: '2026-11-26T14:00:00.000Z', shiftType: 'DAY', sales: '0.20', paymentsCount: 1, variance: '-0.10' },
          { id: 'night', closedAt: '2026-11-25T23:30:00.000Z', shiftType: 'NIGHT', sales: '125.10', paymentsCount: 2, variance: '0.00' },
        ],
      },
      {
        id: 'bruno',
        name: 'Bruno',
        clientsCreated: 1,
        closedSessions: 0,
        paymentsCount: 0,
        sales: '0.00',
        periods: [{ key: '2026-11-26', clientsCreated: 1, closedSessions: 0, paymentsCount: 0, sales: '0.00' }],
        closures: [],
      },
    ]);
  });

  it('regroupe les clôtures et les clients par semaine, mois ou année', () => {
    const weekly = summarizeReceptionistPerformance({ ...source, granularity: 'week' });
    const monthly = summarizeReceptionistPerformance({ ...source, granularity: 'month' });
    const yearly = summarizeReceptionistPerformance({ ...source, granularity: 'year' });

    expect(weekly.staff[0].periods[0].key).toBe('2026-11-23');
    expect(monthly.staff[0].periods[0].key).toBe('2026-11');
    expect(yearly.staff[0].periods[0].key).toBe('2026');
  });
});

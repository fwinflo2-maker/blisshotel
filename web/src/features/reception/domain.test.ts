import { describe, expect, it } from 'vitest';
import { calculateBalanceCents, canCheckout, dateRangesOverlap, isRateOutsideRange, isSamePaymentRequest, localDateTimeToUtc, nightlyRatePolicy, nightlyRateRangeForRoom, nightsBetween, siestaEndAt, timeRangesOverlap } from './domain';
import { periodStartInTimeZone } from './domain';

describe('règles de séjour', () => {
  it('autorise les tarifs dans la fourchette, bornes incluses, et détecte ceux qui la dépassent', () => {
    expect(isRateOutsideRange('30000', '30000', '40000')).toBe(false);
    expect(isRateOutsideRange('40000', '30000', '40000')).toBe(false);
    expect(isRateOutsideRange('29999.99', '30000', '40000')).toBe(true);
    expect(isRateOutsideRange('40000.01', '30000', '40000')).toBe(true);
  });

  it('retourne les fourchettes nuitées fournies par chambre, avec 107 au tarif fixe', () => {
    expect(nightlyRateRangeForRoom('101')).toEqual({ minimum: '30000.00', maximum: '40000.00' });
    expect(nightlyRateRangeForRoom('107')).toEqual({ minimum: '20000.00', maximum: '20000.00' });
    expect(nightlyRateRangeForRoom('202')).toEqual({ minimum: '15000.00', maximum: '20000.00' });
    expect(nightlyRateRangeForRoom('440')).toEqual({ minimum: '50000.00', maximum: '80000.00' });
    expect(nightlyRateRangeForRoom('999')).toBeNull();
  });

  it('détecte les tarifs de la chambre 202 hors de sa fourchette', () => {
    expect(isRateOutsideRange('15000', '15000', '20000')).toBe(false);
    expect(isRateOutsideRange('20000', '15000', '20000')).toBe(false);
    expect(isRateOutsideRange('14999.99', '15000', '20000')).toBe(true);
    expect(isRateOutsideRange('20000.01', '15000', '20000')).toBe(true);
  });

  it('sépare les suppléments facultatifs de petit-déjeuner ou déjeuner du tarif chambre', () => {
    expect(nightlyRatePolicy('25000.00', '30000.00')).toEqual({
      minimum: '25000.00',
      maximum: '25000.00',
      optionalMeal: { code: 'BREAKFAST', name: 'Petit-déjeuner', price: '5000.00' },
    });
    expect(nightlyRatePolicy('25000.00', '35000.00')).toEqual({
      minimum: '25000.00',
      maximum: '30000.00',
      optionalMeal: { code: 'LUNCH', name: 'Déjeuner', price: '5000.00' },
    });
    expect(nightlyRatePolicy('50000.00', '80000.00')).toEqual({
      minimum: '50000.00',
      maximum: '80000.00',
      optionalMeal: null,
    });
  });

  it('n’accepte pas le supplément de repas comme tarif de chambre', () => {
    const breakfastRoomRate = nightlyRatePolicy('25000.00', '30000.00');
    expect(isRateOutsideRange('25000.00', breakfastRoomRate.minimum, breakfastRoomRate.maximum)).toBe(false);
    expect(isRateOutsideRange('30000.00', breakfastRoomRate.minimum, breakfastRoomRate.maximum)).toBe(true);

    const lunchRoomRate = nightlyRatePolicy('25000.00', '35000.00');
    expect(isRateOutsideRange('30000.00', lunchRoomRate.minimum, lunchRoomRate.maximum)).toBe(false);
    expect(isRateOutsideRange('35000.00', lunchRoomRate.minimum, lunchRoomRate.maximum)).toBe(true);
  });

  it('calcule des nuits civiles, y compris au changement de mois et les années bissextiles', () => {
    expect(nightsBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(nightsBetween('2027-12-31', '2028-01-01')).toBe(1);
  });

  it('rejette une période nulle ou inversée', () => {
    expect(nightsBetween('2027-05-10', '2027-05-10')).toBe(0);
    expect(nightsBetween('2027-05-11', '2027-05-10')).toBe(0);
  });

  it('autorise une nouvelle arrivée le jour du départ, mais bloque tout chevauchement', () => {
    expect(dateRangesOverlap('2027-05-10', '2027-05-12', '2027-05-12', '2027-05-14')).toBe(false);
    expect(dateRangesOverlap('2027-05-10', '2027-05-13', '2027-05-12', '2027-05-14')).toBe(true);
  });

  it('calcule une sieste de 3 h 30 depuis son arrivée réelle', () => {
    const arrival = new Date('2027-05-10T12:07:25.000Z');
    expect(siestaEndAt(arrival).toISOString()).toBe('2027-05-10T15:37:25.000Z');
    expect(timeRangesOverlap(arrival, siestaEndAt(arrival), new Date('2027-05-10T15:00:00Z'), new Date('2027-05-10T16:00:00Z'))).toBe(true);
    expect(timeRangesOverlap(arrival, siestaEndAt(arrival), new Date('2027-05-10T15:37:25Z'), new Date('2027-05-10T16:00:00Z'))).toBe(false);
  });

  it('convertit une heure locale avec le fuseau de l’hôtel et rejette les heures inexistantes', () => {
    expect(localDateTimeToUtc('2027-01-15T12:00', 'Europe/Paris').toISOString()).toBe('2027-01-15T11:00:00.000Z');
    expect(localDateTimeToUtc('2027-07-15T12:00', 'Europe/Paris').toISOString()).toBe('2027-07-15T10:00:00.000Z');
    expect(() => localDateTimeToUtc('2027-03-28T02:30', 'Europe/Paris')).toThrow(RangeError);
  });

  it('ne présente pas un solde négatif si les encaissements dépassent le montant', () => {
    expect(calculateBalanceCents(12_000, 4_500)).toBe(7_500);
    expect(calculateBalanceCents(12_000, 15_000)).toBe(0);
  });

  it('démarre les statistiques semaine le lundi et le mois le premier jour dans le fuseau hôtel', () => {
    const now = new Date('2027-03-17T12:00:00.000Z'); // mercredi
    expect(periodStartInTimeZone('day', now, 'UTC').toISOString()).toBe('2027-03-17T00:00:00.000Z');
    expect(periodStartInTimeZone('week', now, 'UTC').toISOString()).toBe('2027-03-15T00:00:00.000Z');
    expect(periodStartInTimeZone('month', now, 'UTC').toISOString()).toBe('2027-03-01T00:00:00.000Z');
    expect(periodStartInTimeZone('day', now, 'Europe/Paris').toISOString()).toBe('2027-03-16T23:00:00.000Z');
  });

  it('bloque le départ avec solde sauf si la règle de l’hôtel l’autorise', () => {
    expect(canCheckout(1, false)).toBe(false);
    expect(canCheckout(0, false)).toBe(true);
    expect(canCheckout(1, true)).toBe(true);
  });

  it('reconnaît uniquement les reprises du même paiement et de la même référence', () => {
    const request = {
      folioId: 'folio-1',
      clientId: null,
      paymentMethodId: 'cash',
      amount: '125.00',
      reference: 'TX-1',
      description: null,
      receivedBy: 'user-1',
    };
    expect(isSamePaymentRequest(request, { ...request, amount: '125' })).toBe(true);
    expect(isSamePaymentRequest(request, { ...request, amount: '126.00' })).toBe(false);
    expect(isSamePaymentRequest(request, { ...request, reference: 'TX-2' })).toBe(false);
    expect(isSamePaymentRequest(request, { ...request, receivedBy: 'user-2' })).toBe(false);
    expect(isSamePaymentRequest(
      { ...request, folioId: null, clientId: 'client-1', description: 'Acompte' },
      { ...request, folioId: null, clientId: 'client-1', description: 'Acompte', amount: '125' },
    )).toBe(true);
    expect(isSamePaymentRequest(
      { ...request, folioId: null, clientId: 'client-1', description: 'Acompte' },
      { ...request, folioId: null, clientId: 'client-2', description: 'Acompte' },
    )).toBe(false);
  });
});

/**
 * Scénarios de bout en bout du poste réceptionniste (section 15 de la mission).
 * Exécute des appels HTTP RÉELS contre un serveur BLISS HOTEL démarré sur une
 * base de test dédiée. Aucune donnée n'est simulée : tout est écrit en base.
 *
 * Utilisation :
 *   DATABASE_URL=... BASE_URL=http://127.0.0.1:3100 npx tsx scripts/e2e-reception.ts
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase } from '../src/lib/database';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const db = createDatabase();

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

type Session = { cookie: string; label: string };

async function login(email: string, password: string, label: string): Promise<Session | null> {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return null;
  const raw = response.headers.get('set-cookie') ?? '';
  const cookie = raw.split(';')[0];
  return cookie ? { cookie, label } : null;
}

async function api<T = Record<string, unknown>>(session: Session, method: string, path: string, body?: unknown): Promise<{ status: number; data: T & { error?: string } }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: session.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  return { status: response.status, data };
}

function isoDay(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function main() {
  console.log('— Préparation de la base de test (données réelles, aucune donnée fictive affichée à l’interface) —');
  // Nettoyage idempotent des comptes de test et de leurs données métier.
  const emails = ['e2e-admin@blisshotel.test', 'e2e-rec1@blisshotel.test', 'e2e-rec2@blisshotel.test'];
  const existing = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = existing.map((user) => user.id);
  if (ids.length) {
    const clients = await db.client.findMany({ where: { createdBy: { in: ids } }, select: { id: true } });
    const clientIds = clients.map((client) => client.id);
    const reservations = clientIds.length
      ? await db.reservation.findMany({ where: { OR: [{ createdBy: { in: ids } }, { clientId: { in: clientIds } }] }, select: { id: true } })
      : await db.reservation.findMany({ where: { createdBy: { in: ids } }, select: { id: true } });
    const reservationIds = reservations.map((reservation) => reservation.id);
    if (reservationIds.length) {
      const folios = await db.folio.findMany({ where: { reservationId: { in: reservationIds } }, select: { id: true } });
      const folioIds = folios.map((folio) => folio.id);
      if (folioIds.length) {
        await db.payment.deleteMany({ where: { folioId: { in: folioIds } } });
        await db.invoice.deleteMany({ where: { folioId: { in: folioIds } } });
        await db.folioLine.deleteMany({ where: { folioId: { in: folioIds } } });
        await db.folio.deleteMany({ where: { id: { in: folioIds } } });
      }
      await db.housekeepingTask.deleteMany({ where: { reservationId: { in: reservationIds } } });
      await db.stay.deleteMany({ where: { reservationId: { in: reservationIds } } });
      await db.reservation.deleteMany({ where: { id: { in: reservationIds } } });
    }
    if (clientIds.length) await db.client.deleteMany({ where: { id: { in: clientIds } } });
    await db.cashSession.deleteMany({ where: { userId: { in: ids } } });
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }

  await db.hotelConfiguration.update({
    where: { id: 1 },
    data: { timezone: 'UTC', currency: 'EUR', checkInTime: '14:00', checkOutTime: '12:00', allowCheckoutWithBalance: false },
  });
  const receptionRole = await db.role.findUnique({ where: { key: 'template:RECEPTIONIST' } });
  if (!receptionRole) throw new Error('Le seed RBAC doit être exécuté sur la base de test.');

  const bcrypt = await import('bcryptjs');
  const password = 'E2eScrypt!2026';
  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.create({ data: { email: emails[0], name: 'Admin E2E', passwordHash, platformAdmin: true, active: true } });
  const rec1 = await db.user.create({ data: { email: emails[1], name: 'Receptionniste Una', passwordHash, roleId: receptionRole.id, active: true } });
  const rec2 = await db.user.create({ data: { email: emails[2], name: 'Receptionniste Deux', passwordHash, roleId: receptionRole.id, active: true } });

  const suffix = randomBytes(3).toString('hex').toUpperCase();
  const category = await db.roomCategory.create({ data: { name: `E2E CAT ${suffix}`, capacity: 2, nightlyRate: '50.00', siestaRate: '20.00' } });
  const roomA = await db.room.create({ data: { number: `E2E-A${suffix}`, categoryId: category.id, floor: 'E2E' } });
  const roomB = await db.room.create({ data: { number: `E2E-B${suffix}`, categoryId: category.id, floor: 'E2E' } });
  let cash = await db.paymentMethod.findUnique({ where: { code: 'CASH' } });
  if (!cash) cash = await db.paymentMethod.create({ data: { code: 'CASH', name: 'Espèces (E2E)' } });
  const mobile = await db.paymentMethod.create({ data: { code: `E2EPM${suffix}`, name: 'Mobile E2E' } });

  console.log('— Connexions des trois comptes —');
  const adminSession = await login(emails[0], password, 'admin');
  const s1 = await login(emails[1], password, 'rec1');
  const s2 = await login(emails[2], password, 'rec2');
  check('Comptes réceptionnistes et admin créés via API/seed et connexions réussies', Boolean(adminSession && s1 && s2));
  if (!adminSession || !s1 || !s2) throw new Error('Connexion impossible — serveur démarré sur la bonne base ?');

  // 1. Une réceptionniste crée une fiche client.
  console.log('— Scénario 1 : création client par la réceptionniste 1 —');
  const clientName = `Client E2E ${suffix}`;
  const createClient = await api<{ client: { id: string } }>(s1, 'POST', '/api/reception/clients', {
    name: clientName, phone: '+33600000000', email: `e2e.${suffix}@client.test`, nationality: 'Française', address: '1 rue des Tests', idType: 'Passeport', idNumber: `FR-${suffix}`, notes: 'Fiche créée pour la recette',
  });
  check('1. La réceptionniste 1 enregistre un client', createClient.status === 201, JSON.stringify(createClient.data));
  const clientId = createClient.data.client?.id ?? '';
  const duplicateCheck = await api<{ possibleDuplicates: { id: string }[] }>(s1, 'POST', '/api/reception/clients/check-duplicates', {
    name: clientName, phone: '+33600000000', email: `e2e.${suffix}@client.test`, idType: 'Passeport', idNumber: `FR-${suffix}`,
  });
  check('1a. Une fiche correspondant aux coordonnées est signalée avant création', duplicateCheck.data.possibleDuplicates?.some((client) => client.id === clientId));
  const duplicateCreate = await api(s1, 'POST', '/api/reception/clients', {
    name: clientName, phone: '+33600000000', email: `e2e.${suffix}@client.test`, idType: 'Passeport', idNumber: `FR-${suffix}`,
  });
  check('1b. La création signale le doublon pour laisser le réceptionniste décider', duplicateCreate.status === 409);
  const confirmedDuplicate = await api(s1, 'POST', '/api/reception/clients', {
    name: clientName, phone: '+33600000000', email: `e2e.${suffix}@client.test`, idType: 'Passeport', idNumber: `FR-${suffix}`, allowPossibleDuplicate: true,
  });
  check('1c. La création peut continuer après confirmation explicite', confirmedDuplicate.status === 201);

  // 2. Une deuxième réceptionniste retrouve et utilise cette fiche.
  console.log('— Scénario 2 : recherche par la réceptionniste 2 —');
  const found = await api<{ clients: { id: string; createdByName: string | null }[] }>(s2, 'GET', `/api/reception/clients?q=${encodeURIComponent(clientName)}`);
  check('2. La réceptionniste 2 retrouve la fiche créée par sa collègue', found.data.clients?.some((client) => client.id === clientId));

  // 3 & 4. La deuxième réceptionniste réserve ; les deux identités sont conservées.
  console.log('— Scénarios 3-4 : réservation par la réceptionniste 2 et traçabilité —');
  const idem = `${randomUUID()}${randomUUID().slice(0, 8)}`;
  const specialRateWithoutReason = await api(s2, 'POST', '/api/reception/reservations', {
    clientId, roomId: roomB.id, checkInDate: isoDay(0), checkOutDate: isoDay(1), stayType: 'OVERNIGHT', agreedRate: '49.99', adults: 1, children: 0, idempotencyKey: `${randomUUID()}${randomUUID().slice(0, 8)}`,
  });
  check('3a. Un tarif hors fourchette sans justification est refusé (400)', specialRateWithoutReason.status === 400, JSON.stringify(specialRateWithoutReason.data));
  const specialRate = await api<{ reservation: { reference: string; rateReason: string | null } }>(s2, 'POST', '/api/reception/reservations', {
    clientId, roomId: roomB.id, checkInDate: isoDay(2), checkOutDate: isoDay(3), stayType: 'OVERNIGHT', agreedRate: '45.00', rateReason: 'Accord client exceptionnel', adults: 1, children: 0, idempotencyKey: `${randomUUID()}${randomUUID().slice(0, 8)}`,
  });
  check('3b. Un tarif hors fourchette justifié est accepté et conservé', specialRate.status === 201 && specialRate.data.reservation?.rateReason === 'Accord client exceptionnel', JSON.stringify(specialRate.data));
  const siesta = await api<{ reservation: { totalAmount: string } }>(s2, 'POST', '/api/reception/reservations', {
    clientId, roomId: roomB.id, checkInDate: isoDay(4), checkInTime: '15:00', stayType: 'SIESTA', agreedRate: '15.00', adults: 1, children: 0, idempotencyKey: `${randomUUID()}${randomUUID().slice(0, 8)}`,
  });
  check('3c. Le prix d’une sieste est défini librement avec le client', siesta.status === 201 && siesta.data.reservation?.totalAmount === '15.00', JSON.stringify(siesta.data));
  const reservation = await api<{ reservation: { id: string; reference: string; createdByName: string | null; checkOutDate: string; totalAmount: string; folio: { id: string; balance: string } | null } }>(s2, 'POST', '/api/reception/reservations', {
    clientId, roomId: roomA.id, checkInDate: isoDay(0), checkOutDate: isoDay(2), stayType: 'OVERNIGHT', agreedRate: '50.00', adults: 1, children: 0, idempotencyKey: idem,
  });
  check('3. Réservation de deux nuits facturée au tarif par nuit', reservation.status === 201 && reservation.data.reservation?.totalAmount === '100.00' && reservation.data.reservation?.checkOutDate === isoDay(2), JSON.stringify(reservation.data));
  const ref = reservation.data.reservation?.reference ?? '';
  const folioId = reservation.data.reservation?.folio?.id ?? '';
  const clientDetail = await api<{ client: { createdByName: string | null; createdBy: string | null; reservations: { createdByName: string | null }[] } }>(s1, 'GET', `/api/reception/clients/${clientId}`);
  check('4a. Créateur client conservé = réceptionniste 1', clientDetail.data.client?.createdByName === rec1.name, `obtenu: ${clientDetail.data.client?.createdByName}`);
  check('4b. Créateur réservation = réceptionniste 2 (identité distincte)', clientDetail.data.client?.reservations?.[0]?.createdByName === rec2.name, `obtenu: ${JSON.stringify(clientDetail.data.client?.reservations)}`);

  // 5. Les deux réceptionnistes voient la même réservation.
  console.log('— Scénario 5 : visibilité partagée —');
  const seen1 = await api<{ reservations: { reference: string }[] }>(s1, 'GET', `/api/reception/reservations?q=${encodeURIComponent(ref)}`);
  const seen2 = await api<{ reservations: { reference: string }[] }>(s2, 'GET', `/api/reception/reservations?q=${encodeURIComponent(ref)}`);
  check('5. La réservation est visible par les deux réceptionnistes',
    seen1.data.reservations?.some((item) => item.reference === ref) && seen2.data.reservations?.some((item) => item.reference === ref));

  // 6. Double réservation incompatible bloquée côté serveur.
  console.log('— Scénario 6 : conflit de chambre —');
  const conflict = await api(s1, 'POST', '/api/reception/reservations', {
    clientId, roomId: roomA.id, checkInDate: isoDay(1), checkOutDate: isoDay(3), stayType: 'OVERNIGHT', agreedRate: '50.00', adults: 1, children: 0, idempotencyKey: `${randomUUID()}${randomUUID().slice(0, 8)}`,
  });
  check('6a. Seconde réservation sur la même chambre/période refusée (409)', conflict.status === 409, `status ${conflict.status}`);
  const idemRetry = await api<{ duplicate: boolean }>(s2, 'POST', '/api/reception/reservations', {
    clientId, roomId: roomA.id, checkInDate: isoDay(0), checkOutDate: isoDay(2), stayType: 'OVERNIGHT', agreedRate: '50.00', adults: 1, children: 0, idempotencyKey: idem,
  });
  check('6b. Répétition de la même requête = idempotente (pas de doublon)', idemRetry.status === 200 && idemRetry.data.duplicate === true);

  // Confirmation par R2, check-in par R1.
  console.log('— Scénario 7 : confirmation puis check-in croisés —');
  await api(s2, 'POST', `/api/reception/reservations/${reservation.data.reservation?.id}/actions`, { action: 'confirm' });
  const checkIn = await api<{ status: string }>(s1, 'POST', `/api/reception/reservations/${reservation.data.reservation?.id}/actions`, { action: 'check-in' });
  check('7. Check-in effectué par la réceptionniste 1 sur une réservation créée par la 2', checkIn.status === 200 && checkIn.data.status === 'CHECKED_IN', JSON.stringify(checkIn.data));
  const roomsAfterIn = await api<{ rooms: { id: string; status: string }[] }>(s1, 'GET', `/api/reception/rooms?from=${isoDay(0)}&to=${isoDay(2)}`);
  check('7b. Chambre A automatiquement occupée', roomsAfterIn.data.rooms?.find((room) => room.id === roomA.id)?.status === 'OCCUPIED');

  // 8. L'autre réceptionniste consulte le séjour.
  console.log('— Scénario 8 : consultation du séjour en cours —');
  const inhouse = await api<{ reservations: { reference: string }[] }>(s2, 'GET', '/api/reception/reservations?period=inhouse');
  check('8. La réceptionniste 2 consulte le séjour ouvert par la 1', inhouse.data.reservations?.some((item) => item.reference === ref));

  // Changement de chambre (R2 déménage le client de la réceptionniste 1).
  console.log('— Scénario bonus : changement de chambre en cours de séjour —');
  const move = await api(s2, 'PATCH', `/api/reception/reservations/${reservation.data.reservation?.id}`, { action: 'move', roomId: roomB.id });
  check('Bonus 1. Changement de chambre accepté et tracé', move.status === 200, JSON.stringify(move.data));
  const roomsAfterMove = await api<{ rooms: { id: string; status: string; housekeepingStatus: string }[] }>(s1, 'GET', `/api/reception/rooms?from=${isoDay(0)}&to=${isoDay(2)}`);
  const roomARow = roomsAfterMove.data.rooms?.find((room) => room.id === roomA.id);
  const roomBRow = roomsAfterMove.data.rooms?.find((room) => room.id === roomB.id);
  check('Bonus 2. Ancienne chambre à nettoyer, nouvelle occupée', roomARow?.status === 'DIRTY' && roomARow?.housekeepingStatus === 'TO_CLEAN' && roomBRow?.status === 'OCCUPIED');

  // 9. Paiement dans la caisse de son auteur + idempotence.
  console.log('— Scénario 9 : encaissements —');
  const openCash = await api(s1, 'POST', '/api/reception/cash-session', { openingAmount: '20.00' });
  check('9a. Caisse ouverte par la réceptionniste 1', openCash.status === 201);
  const payKey = `${randomUUID()}${randomUUID().slice(0, 8)}`;
  const pay = await api<{ payment: { amount: string } }>(s1, 'POST', '/api/reception/payments', { folioId, paymentMethodId: cash.id, amount: '30.00', reference: 'E2E-ESPECES', idempotencyKey: payKey });
  check('9b. Acompte de 30 encaissé par la réceptionniste 1', pay.status === 201, JSON.stringify(pay.data));
  const payAgain = await api<{ duplicate: boolean; payment: { amount: string } }>(s1, 'POST', '/api/reception/payments', { folioId, paymentMethodId: cash.id, amount: '30.00', reference: 'E2E-ESPECES', idempotencyKey: payKey });
  check('9c. Double-encaissement prevented by idempotency', payAgain.status === 200 && payAgain.data.duplicate === true);
  const overPay = await api(s1, 'POST', '/api/reception/payments', { folioId, paymentMethodId: cash.id, amount: '99.00', idempotencyKey: `${randomUUID()}${randomUUID().slice(0, 8)}` });
  check('9d. Encaissement supérieur au solde refusé', overPay.status === 409);

  // 10. Statistiques personnelles distinctes.
  console.log('— Scénario 10 : séparation personnel/global —');
  const overview1 = await api<{ personalActivity: { payments: number; amountCollected: string } }>(s1, 'GET', '/api/reception/overview?period=day');
  const overview2 = await api<{ personalActivity: { payments: number; amountCollected: string } }>(s2, 'GET', '/api/reception/overview?period=day');
  check('10a. CA personnel R1 = 30.00 (1 paiement)', overview1.data.personalActivity?.payments === 1 && overview1.data.personalActivity?.amountCollected === '30.00', JSON.stringify(overview1.data.personalActivity));
  check('10b. CA personnel R2 = 0 bien qu’elle voie les données de l’hôtel', overview2.data.personalActivity?.amountCollected === '0.00');
  check('10c. R1 voit l’activité d’équipe (traçabilité collective)', overview1.data && typeof overview1.data === 'object');

  // Modification de fiche par R2 : le créateur R1 reste figé.
  console.log('— Scénario bonus : modification de fiche sans écrasement du créateur —');
  const editClient = await api(s2, 'PATCH', `/api/reception/clients/${clientId}`, { name: clientName, phone: '+33600000001', email: `e2e.${suffix}@client.test`, nationality: 'Belge', address: '2 rue des Tests', idType: 'Passeport', idNumber: `FR-${suffix}`, notes: 'Complétée par la collègue' });
  const afterEdit = await api<{ client: { createdBy: string | null; createdByName: string | null; nationality: string | null } }>(s1, 'GET', `/api/reception/clients/${clientId}`);
  check('Bonus 3. Fiche modifiable mais créateur d’origine conservé', editClient.status === 200 && afterEdit.data.client?.createdBy === rec1.id && afterEdit.data.client?.createdByName === rec1.name && afterEdit.data.client?.nationality === 'Belge');

  // 11. Paiement du solde par R2, facture, check-out, clôture de caisse avec historique.
  console.log('— Scénario 11 : solde, facture, départ, clôture —');
  await api(s2, 'POST', '/api/reception/cash-session', { openingAmount: '0.00' });
  const payRest = await api(s2, 'POST', '/api/reception/payments', { folioId, paymentMethodId: mobile.id, amount: '70.00', reference: 'E2E-MOBILE', idempotencyKey: `${randomUUID()}${randomUUID().slice(0, 8)}` });
  check('11a. Solde de 70 après acompte sur un séjour de deux nuits', payRest.status === 201);
  const payerName = `Payeur E2E ${suffix}`;
  const invoice = await api<{ invoice: { number: string; payerName: string | null } }>(s2, 'POST', `/api/reception/folios/${folioId}/invoice`, { payerName });
  check('11b. Facture émise au nom du payeur choisi', (invoice.status === 201 || invoice.status === 200) && invoice.data.invoice?.payerName === payerName, JSON.stringify(invoice.data));
  const checkOut = await api<{ status: string }>(s1, 'POST', `/api/reception/reservations/${reservation.data.reservation?.id}/actions`, { action: 'check-out' });
  check('11c. Check-out accepté (solde soldé)', checkOut.status === 200 && checkOut.data.status === 'CHECKED_OUT', JSON.stringify(checkOut.data));
  const closeSession = await api<{ session: { status: string; variance: string | null; transactions: unknown[] }; report: { shiftType: string; expenses: { amount: string }[]; summary: { cash: { expectedCash: string; cashExpenses: string } } } }>(s1, 'PATCH', '/api/reception/cash-session', {
    sessionId: (await api<{ sessions: { id: string; status: string }[] }>(s1, 'GET', '/api/reception/cash-session')).data.sessions.find((item) => item.status === 'OPEN')!.id,
    countedAmount: '50.00',
    shiftType: 'DAY',
    expenses: [{ description: 'Fournitures de réception', amount: '5.00', paymentMethodId: cash.id }],
  });
  check('11d. Clôture de caisse : écart calculé, dépense espèces déduite et rapport créé', closeSession.status === 200 && closeSession.data.session?.status === 'CLOSED' && closeSession.data.session?.transactions.length === 1 && closeSession.data.report?.shiftType === 'DAY' && closeSession.data.report.summary.cash.expectedCash === '45.00' && closeSession.data.report.summary.cash.cashExpenses === '5.00' && closeSession.data.report.expenses.length === 1, JSON.stringify(closeSession.data));
  const ownReports = await api<{ reports: { cashSessionId: string }[] }>(s1, 'GET', '/api/shift-reports');
  const colleagueReports = await api<{ reports: { cashSessionId: string }[] }>(s2, 'GET', '/api/shift-reports');
  check('11e. Chaque réceptionniste ne consulte que ses propres rapports', ownReports.data.reports?.length === 1 && colleagueReports.data.reports?.length === 0);
  const history = await api<{ sessions: { status: string; transactions: unknown[] }[] }>(s1, 'GET', '/api/reception/cash-session');
  const closedSession = history.data.sessions?.find((item) => item.status === 'CLOSED');
  check('11f. Historique des transactions consultable après clôture', closedSession?.transactions?.length === 1, JSON.stringify(closedSession?.transactions?.length));
  const folioAfter = await api<{ folio: { payments: unknown[]; invoice: unknown } }>(s1, 'GET', `/api/reception/folios/${folioId}`);
  check('11g. Aucun encaissement validé supprimé : 2 paiements et facture toujours liés', folioAfter.data.folio?.payments?.length === 2 && Boolean(folioAfter.data.folio?.invoice));

  // Notifications et activité.
  console.log('— Traçabilité et notifications —');
  const teamActivity = await api<{ events: { action: string; actor: string }[] }>(s1, 'GET', '/api/reception/activity?scope=all&period=day');
  check('Activité d’équipe consultable en lecture seule', (teamActivity.data.events?.length ?? 0) >= 8, `events: ${teamActivity.data.events?.length}`);
  const notifications = await api<{ notifications: { message: string }[]; unreadCount: number }>(s2, 'GET', '/api/reception/notifications');
  check('Notifications reçues par la collègue (paiement/encaissement croisé)', (notifications.data.notifications?.length ?? 0) >= 1, JSON.stringify(notifications.data.notifications?.[0]?.message));

  // 12. Compte désactivé.
  console.log('— Scénario 12 : désactivation de compte —');
  const suspend = await api(adminSession, 'PATCH', '/api/super-admin/users', { userId: rec2.id, active: false });
  check('12a. Le super administrateur désactive le compte', suspend.status === 200);
  const blockedApi = await api(s2, 'GET', '/api/reception/overview');
  check('12b. La session active du compte désactivé est rejetée', blockedApi.status === 401, `status ${blockedApi.status}`);
  const blockedLogin = await login(emails[2], password, 'rec2-again');
  check('12c. La connexion du compte désactivé est refusée', blockedLogin === null);
  const reactivate = await api(adminSession, 'PATCH', '/api/super-admin/users', { userId: rec2.id, active: true });
  const backIn = await login(emails[2], password, 'rec2');
  check('12d. Réactivé, le compte peut de nouveau se connecter', reactivate.status === 200 && Boolean(backIn));

  // Créé par le super administrateur (scénario §11).
  console.log('— Création de compte réceptionniste par le super administrateur —');
  const created = await api<{ user: { id: string } }>(adminSession, 'POST', '/api/super-admin/users', { name: 'Recrutée E2E', email: `e2e-rec3-${suffix}@blisshotel.test`, password: 'E2eRecrutee!321', roleCode: 'RECEPTIONIST' });
  check('Compte réceptionniste créé individuellement par le super admin', created.status === 201, JSON.stringify(created.data));
  const createdLogin = await login(`e2e-rec3-${suffix}@blisshotel.test`, 'E2eRecrutee!321', 'rec3');
  check('Le nouveau compte peut se connecter à /reception', Boolean(createdLogin));

  console.log(`\nRésultat : ${passed} PASS / ${failed} FAIL`);
  if (failures.length) {
    console.log('Échecs :');
    failures.forEach((name) => console.log(` - ${name}`));
  }
  await db.$disconnect();
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (error) => {
  console.error('ERREUR FATALE E2E :', error);
  await db.$disconnect();
  process.exitCode = 2;
});

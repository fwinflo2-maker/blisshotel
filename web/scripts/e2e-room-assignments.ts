import { createHash, randomBytes, randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createDatabase } from '../src/lib/database';

dotenv.config({ path: '.env.local' });

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3101';
const db = createDatabase();
const startedAt = new Date();
const suffix = randomUUID();
const createdUserIds: string[] = [];
const createdSessionHashes: string[] = [];
let testRoomId = '';
let originalAssignee: string | null = null;
let passed = 0;
let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}

async function makeSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await db.session.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  createdSessionHashes.push(tokenHash);
  return `__Host-bliss-session=${token}`;
}

async function api(path: string, cookie: string, init?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'Content-Type': 'application/json', ...init?.headers } });
  return { status: response.status, data: await response.json() as Record<string, any> };
}
async function page(path: string, cookie: string) {
  const response = await fetch(`${BASE}${path}`, { headers: { cookie } });
  return { status: response.status, html: await response.text() };
}

async function main() {
try {
  const [ownerRole, adminRole, room] = await Promise.all([
    db.role.findFirstOrThrow({ where: { code: 'OWNER' } }),
    db.role.findFirstOrThrow({ where: { code: 'HOTEL_ADMIN' } }),
    db.room.findFirstOrThrow({ where: { active: true }, orderBy: { number: 'asc' }, select: { id: true, assignedHotelAdminId: true } }),
  ]);
  testRoomId = room.id;
  originalAssignee = room.assignedHotelAdminId;

  async function user(name: string, platformAdmin = false, roleId: string | null = null) {
    const created = await db.user.create({ data: { email: `room-assignment-${name}-${suffix}@test.invalid`, name, passwordHash: 'unused-e2e-password-hash', roleId, platformAdmin } });
    createdUserIds.push(created.id);
    return { id: created.id, cookie: await makeSession(created.id) };
  }

  const [owner, platform, adminA, adminB] = await Promise.all([
    user('owner', false, ownerRole.id), user('super-admin', true), user('admin-a', false, adminRole.id), user('admin-b', false, adminRole.id),
  ]);
  const [inventoryA, inventoryB, ownerInventory, platformInventory] = await Promise.all([
    api('/api/reception/rooms', adminA.cookie), api('/api/reception/rooms', adminB.cookie),
    api('/api/room-assignments', owner.cookie), api('/api/room-assignments', platform.cookie),
  ]);
  check('Owner sees the complete central room inventory', ownerInventory.status === 200 && ownerInventory.data.rooms.length > 0);
  const adminAccounts = await api('/api/hotel-admins', owner.cookie);
  check('Owner can load the Administrateur Hôtel account list', adminAccounts.status === 200 && adminAccounts.data.administrators.length >= 2);
  check('Super Administrator sees the complete central room inventory', platformInventory.status === 200 && platformInventory.data.rooms.length === ownerInventory.data.rooms.length);
  const [ownerPage, platformPage, adminPage] = await Promise.all([
    page('/proprietaire', owner.cookie), page('/super-admin', platform.cookie), page('/admin-hotel', adminA.cookie),
  ]);
  check('Owner UI exposes room assignment management', ownerPage.status === 200 && ownerPage.html.includes('Attribution des chambres'));
  check('Owner UI exposes per-account permissions', ownerPage.status === 200 && ownerPage.html.includes('Permissions individuelles'));
  check('Administrator UI exposes the dedicated Mes chambres section', adminPage.status === 200 && adminPage.html.includes('Mes chambres'));
  check('Super Administrator UI exposes room assignment management', platformPage.status === 200 && platformPage.html.includes('Attribution des chambres'));

  const assignA = await api('/api/room-assignments', owner.cookie, { method: 'PUT', body: JSON.stringify({ assignments: [{ roomId: testRoomId, administratorId: adminA.id }] }) });
  check('Owner assigns a room to Administrator A', assignA.status === 200);
  const assignmentNotice = await api('/api/reception/notifications', adminA.cookie);
  check('Room attribution creates a private notification for its administrator', assignmentNotice.status === 200 && assignmentNotice.data.notifications.some((item: { message: string }) => item.message.includes('vous a été attribuée')));
  const [aSeesOwn, bDoesNotSeeA, bCannotSelfAssign] = await Promise.all([
    api('/api/reception/rooms', adminA.cookie), api('/api/housekeeping/rooms/' + testRoomId, adminB.cookie),
    api('/api/room-assignments', adminB.cookie, { method: 'PUT', body: JSON.stringify({ assignments: [{ roomId: testRoomId, administratorId: adminB.id }] }) }),
  ]);
  check('Administrator A sees the assigned room', aSeesOwn.status === 200 && aSeesOwn.data.rooms.some((item: { id: string }) => item.id === testRoomId));
  check('Administrator B cannot access A room details', bDoesNotSeeA.status === 404);
  check('Administrator cannot modify or self-assign rooms', bCannotSelfAssign.status === 403);
  const [adminOverview, globalReceptionOverview] = await Promise.all([
    api('/api/admin-hotel/overview?period=day', adminA.cookie), api('/api/reception/overview', adminA.cookie),
  ]);
  check('Personal indicators count only the administrator’s assigned room', adminOverview.status === 200 && adminOverview.data.counts.rooms === 1);
  check('Hotel administrators cannot use the global reception dashboard API', globalReceptionOverview.status === 403);
  const ratesWithoutGrant = await api('/api/admin-hotel/rates', adminA.cookie);
  const rateGrant = await api(`/api/hotel-admins/${adminA.id}/permissions`, owner.cookie, { method: 'PUT', body: JSON.stringify({ permissionCodes: ['rooms.rates.view'] }) });
  const [ratesForA, ratesStillDeniedForB] = await Promise.all([api('/api/admin-hotel/rates', adminA.cookie), api('/api/admin-hotel/rates', adminB.cookie)]);
  check('Tariffs are hidden unless a per-account permission is granted', ratesWithoutGrant.status === 403 && rateGrant.status === 200);
  check('A receives only its own room tariffs; the grant does not leak to B', ratesForA.status === 200 && ratesForA.data.rooms.length === 1 && ratesStillDeniedForB.status === 403);

  const duplicate = await api('/api/room-assignments', owner.cookie, { method: 'PUT', body: JSON.stringify({ assignments: [{ roomId: testRoomId, administratorId: adminA.id }, { roomId: testRoomId, administratorId: adminB.id }] }) });
  check('A room cannot be assigned twice in one request', duplicate.status === 400);
  const historyBefore = await db.roomStatusHistory.findMany({ where: { roomId: testRoomId }, orderBy: { id: 'asc' }, select: { id: true, actorId: true, source: true, createdAt: true } });
  const reservationsBefore = await db.reservation.findMany({ where: { roomId: testRoomId }, orderBy: { id: 'asc' }, select: { id: true, createdBy: true, createdByName: true, status: true } });

  const transfer = await api('/api/room-assignments', owner.cookie, { method: 'PUT', body: JSON.stringify({ assignments: [{ roomId: testRoomId, administratorId: adminB.id }] }) });
  check('Owner transfers the room from A to B', transfer.status === 200);
  const [aAfterTransfer, bAfterTransfer] = await Promise.all([
    api('/api/reception/rooms', adminA.cookie), api('/api/reception/rooms', adminB.cookie),
  ]);
  check('A loses management access after transfer', aAfterTransfer.status === 200 && !aAfterTransfer.data.rooms.some((item: { id: string }) => item.id === testRoomId));
  check('B gains access to the transferred room', bAfterTransfer.status === 200 && bAfterTransfer.data.rooms.some((item: { id: string }) => item.id === testRoomId));
  const transferNotice = await api('/api/reception/notifications', adminA.cookie);
  check('The previous administrator receives a private transfer notification', transferNotice.status === 200 && transferNotice.data.notifications.some((item: { message: string }) => item.message.includes('ne vous est plus attribuée')));
  const bRatesAfterTransfer = await api('/api/admin-hotel/rates', adminB.cookie);
  check('A’s personal permission does not transfer with the room', bRatesAfterTransfer.status === 403);
  const [historyAfter, reservationsAfter] = await Promise.all([
    db.roomStatusHistory.findMany({ where: { roomId: testRoomId }, orderBy: { id: 'asc' }, select: { id: true, actorId: true, source: true, createdAt: true } }),
    db.reservation.findMany({ where: { roomId: testRoomId }, orderBy: { id: 'asc' }, select: { id: true, createdBy: true, createdByName: true, status: true } }),
  ]);
  check('Transfer leaves reservation authors and room-status history intact', JSON.stringify(historyBefore) === JSON.stringify(historyAfter) && JSON.stringify(reservationsBefore) === JSON.stringify(reservationsAfter));

  const finalAssignment = await db.room.findUniqueOrThrow({ where: { id: testRoomId }, select: { assignedHotelAdminId: true } });
  check('Exactly one current responsible administrator is stored for a room', finalAssignment.assignedHotelAdminId === adminB.id);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const browserErrors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('requestfailed', (request) => browserErrors.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
    await page.setExtraHTTPHeaders({ Cookie: adminB.cookie });
    await page.goto(`${BASE}/admin-hotel`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Tableau de bord' }).waitFor();
    console.log('UI_STYLE:', JSON.stringify(await page.locator('aside').evaluate((element) => ({ className: element.className, background: getComputedStyle(element).backgroundColor }))));
    await page.screenshot({ path: 'C:/Users/florent/AppData/Local/Temp/bliss-admin-dashboard-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Mes chambres' }).click();
    await page.waitForTimeout(700);
    console.log('UI_AFTER_ROOMS:', (await page.locator('main').innerText()).slice(0, 400), 'BROWSER_ERRORS:', JSON.stringify(browserErrors));
    await page.screenshot({ path: 'C:/Users/florent/AppData/Local/Temp/bliss-admin-rooms-desktop.png', fullPage: true });
    await page.locator('button[class*="roomCard"]').first().waitFor();
    const desktopFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check('Administrator desktop UI renders its assigned room without horizontal overflow', desktopFits);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileSidebar = page.locator('aside');
    console.log('UI_MOBILE_MENU:', JSON.stringify(await mobileSidebar.evaluate((element) => ({ className: element.className, transform: getComputedStyle(element).transform, width: element.getBoundingClientRect().width }))));
    if ((await mobileSidebar.getAttribute('class'))?.includes('ah-sidebarOpen')) await page.getByRole('button', { name: 'Fermer' }).click();
    await page.screenshot({ path: 'C:/Users/florent/AppData/Local/Temp/bliss-admin-rooms-mobile.png', fullPage: true });
    const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check('Administrator room interface adapts to mobile width without horizontal overflow', mobileFits);

    const ownerPage = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    await ownerPage.setExtraHTTPHeaders({ Cookie: owner.cookie });
    await ownerPage.goto(`${BASE}/proprietaire`, { waitUntil: 'networkidle' });
    await ownerPage.getByRole('button', { name: 'Permissions individuelles' }).click();
    await ownerPage.getByRole('heading', { name: 'Permissions des Administrateurs Hôtel' }).waitFor();
    await ownerPage.getByLabel('Compte à configurer').waitFor();
    await ownerPage.screenshot({ path: 'C:/Users/florent/AppData/Local/Temp/bliss-owner-admin-permissions.png', fullPage: true });
    check('Owner permission management UI renders the per-account controls', await ownerPage.locator('.sa-admin-permissions-group').count() > 0);
    await ownerPage.getByRole('button', { name: 'Attribution des chambres' }).click();
    await ownerPage.getByRole('heading', { name: 'Attribution des chambres', level: 2 }).waitFor();
    await ownerPage.screenshot({ path: 'C:/Users/florent/AppData/Local/Temp/bliss-owner-room-assignments.png', fullPage: true });
    await ownerPage.setViewportSize({ width: 390, height: 844 });
    check('Owner assignment interface adapts to mobile width without horizontal overflow', await ownerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  } finally { await browser.close(); }
} catch (error) {
  failed += 1;
  console.error('E2E ERROR', error instanceof Error ? error.message : error);
} finally {
  if (testRoomId) await db.room.update({ where: { id: testRoomId }, data: { assignedHotelAdminId: originalAssignee } });
  if (createdUserIds.length) {
    await db.auditLog.deleteMany({ where: { actorId: { in: createdUserIds }, action: 'ROOM_ADMIN_REASSIGNED', createdAt: { gte: startedAt } } });
  }
  if (createdUserIds.length) await db.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  if (createdSessionHashes.length) await db.session.deleteMany({ where: { tokenHash: { in: createdSessionHashes } } });
  if (createdUserIds.length) await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await db.$disconnect();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
}

void main();

import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { createDatabase } from '../src/lib/database';

dotenv.config({ path: '.env.local' });

const db = createDatabase();
const profiles = [
  { key: 'platform-admin', code: 'SUPER_ADMIN', name: 'Super Administrateur démo', email: 'demo.superadmin@blisshotel.test' },
  { key: 'owner', code: 'OWNER', name: 'Propriétaire démo', email: 'demo.proprietaire@blisshotel.test' },
  { key: 'general-manager', code: 'GENERAL_MANAGER', name: 'Directeur général démo', email: 'demo.directeur@blisshotel.test' },
  { key: 'hotel-admin', code: 'HOTEL_ADMIN', name: 'Administrateur Hôtel démo', email: 'demo.adminhotel@blisshotel.test' },
  { key: 'receptionist', code: 'RECEPTIONIST', name: 'Réceptionniste démo', email: 'demo.reception@blisshotel.test' },
  { key: 'accountant', code: 'ACCOUNTANT', name: 'Comptable démo', email: 'demo.comptable@blisshotel.test' },
  { key: 'governante', code: 'GOUVERNANTE', name: 'Gouvernante démo', email: 'demo.gouvernante@blisshotel.test' },
  { key: 'housekeeper', code: 'HOUSEKEEPER', name: 'Agent entretien démo', email: 'demo.entretien@blisshotel.test' },
  { key: 'restaurant-manager', code: 'RESTAURANT_MANAGER', name: 'Responsable Restaurant & Bar démo', email: 'demo.restaurant@blisshotel.test' },
  { key: 'bar-server', code: 'BAR_SERVER', name: 'Servant(e) du bar démo', email: 'demo.bar@blisshotel.test' },
  { key: 'maintenance-manager', code: 'MAINTENANCE_MANAGER', name: 'Responsable Maintenance démo', email: 'demo.maintenance@blisshotel.test' },
  { key: 'reception-cash', code: 'RECEPTIONIST', name: 'Réceptionniste caisse démo', email: 'demo.reception.caisse@blisshotel.test' },
  { key: 'reception-reservations', code: 'RECEPTIONIST', name: 'Réceptionniste réservations démo', email: 'demo.reception.reservations@blisshotel.test' },
] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL est absente.');
  const target = new URL(databaseUrl);
  const databaseName = target.pathname.replace(/^\//, '').split('?')[0];
  if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname) || databaseName !== 'bliss_hotel') {
    throw new Error('Sécurité : ce script est limité à la base bliss_hotel sur la machine locale.');
  }

  const existing = await db.user.findMany({ where: { email: { in: profiles.map((profile) => profile.email) } }, select: { email: true } });
  if (existing.length) throw new Error(`Comptes démo déjà présents : ${existing.map((item) => item.email).join(', ')}. Aucun compte n’a été modifié.`);
  const roles = await db.role.findMany({ where: { key: { in: profiles.filter((profile) => profile.code !== 'SUPER_ADMIN').map((profile) => `template:${profile.code}`) } }, select: { id: true, code: true, key: true } });
  const missing = profiles.filter((profile) => profile.code !== 'SUPER_ADMIN' && !roles.some((role) => role.key === `template:${profile.code}`));
  if (missing.length) throw new Error(`Rôles manquants : ${missing.map((profile) => profile.code).join(', ')}. Exécutez le seed et les migrations.`);

  const credentials: { profile: string; email: string; password: string }[] = [];
  const hashes = await Promise.all(profiles.map(async (profile) => {
    const password = randomBytes(18).toString('base64url');
    credentials.push({ profile: profile.name, email: profile.email, password });
    return { profile, passwordHash: await bcrypt.hash(password, 12) };
  }));
  const platformAdmin = hashes.find((item) => item.profile.code === 'SUPER_ADMIN')!;
  await db.$transaction(async (tx) => {
    const platformUser = await tx.user.create({
      data: { email: platformAdmin.profile.email, name: platformAdmin.profile.name, passwordHash: platformAdmin.passwordHash, platformAdmin: true, active: true },
      select: { id: true },
    });
    for (const item of hashes.filter((entry) => entry.profile.code !== 'SUPER_ADMIN')) {
      const role = roles.find((candidate) => candidate.key === `template:${item.profile.code}`)!;
      const user = await tx.user.create({ data: { email: item.profile.email, name: item.profile.name, passwordHash: item.passwordHash, roleId: role.id, active: true } });
      await tx.auditLog.create({ data: { actorId: platformUser.id, action: 'PLATFORM_USER_CREATE', result: 'SUCCESS', targetId: user.id, details: { roleCode: role.code, email: user.email, source: 'LOCAL_PROFILE_DEMO_SETUP' } } });
    }
    await tx.auditLog.create({ data: { actorId: platformUser.id, action: 'PLATFORM_PROFILE_DEMO_SETUP', result: 'SUCCESS', targetId: platformUser.id, details: { accountsCreated: profiles.length } } });
  });
  console.log('Comptes de démonstration créés (mots de passe initiaux uniques) :');
  for (const credential of credentials) console.log(`${credential.profile}\t${credential.email}\t${credential.password}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Création des comptes impossible.');
  process.exitCode = 1;
}).finally(async () => db.$disconnect());

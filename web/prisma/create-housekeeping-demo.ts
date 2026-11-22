import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import bcrypt from 'bcryptjs';
import { createDatabase } from '../src/lib/database';

const db = createDatabase();

async function main() {
  const roles = await db.role.findMany({
    where: { code: { in: ['GOUVERNANTE', 'HOUSEKEEPER'] } },
    select: { id: true, code: true },
  });
  const gouvernante = roles.find((role) => role.code === 'GOUVERNANTE');
  const housekeeper = roles.find((role) => role.code === 'HOUSEKEEPER');
  if (!gouvernante || !housekeeper) {
    throw new Error('Exécutez d’abord le seed afin de créer les rôles Housekeeping.');
  }

  const passwordHash = await bcrypt.hash('Bliss2026!', 12);
  await db.$transaction([
    db.user.upsert({
      where: { email: 'gouvernante@blisshotel.com' },
      update: { name: 'Gouvernante BLISS', roleId: gouvernante.id, active: true, passwordHash },
      create: {
        email: 'gouvernante@blisshotel.com',
        name: 'Gouvernante BLISS',
        roleId: gouvernante.id,
        passwordHash,
        active: true,
      },
    }),
    db.user.upsert({
      where: { email: 'agent.entretien@blisshotel.com' },
      update: { name: 'Agent d’entretien BLISS', roleId: housekeeper.id, active: true, passwordHash },
      create: {
        email: 'agent.entretien@blisshotel.com',
        name: 'Agent d’entretien BLISS',
        roleId: housekeeper.id,
        passwordHash,
        active: true,
      },
    }),
  ]);
  console.info('Comptes créés :');
  console.info('Gouvernante : gouvernante@blisshotel.com / Bliss2026!');
  console.info('Agent d’entretien : agent.entretien@blisshotel.com / Bliss2026!');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Création impossible.');
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());

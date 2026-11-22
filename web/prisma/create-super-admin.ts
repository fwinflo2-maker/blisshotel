import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline';
import { createDatabase } from '../src/lib/database';
import { z } from 'zod';

const db = createDatabase();

function ask(prompt: string) {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((resolve) => readline.question(prompt, (answer) => {
    readline.close();
    resolve(answer.trim());
  }));
}

function askPassword(prompt: string) {
  return new Promise<string>((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdin.setRawMode) {
      reject(new Error('Exécutez cette commande depuis le terminal interactif de VS Code.'));
      return;
    }
    process.stdout.write(prompt);
    let value = '';
    const input = process.stdin;
    const finish = (error?: Error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') return finish(new Error('Opération annulée.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function main() {
  const [existingAdmin, bootstrapMarker] = await Promise.all([
    db.user.count({ where: { platformAdmin: true } }),
    db.platformSetting.findUnique({ where: { key: 'system.super_admin_bootstrapped' }, select: { key: true } }),
  ]);
  if (existingAdmin || bootstrapMarker) throw new Error('Le bootstrap Super Administrateur a déjà été utilisé. Utilisez la console plateforme.');

  const name = await ask('Nom du Super Administrateur : ');
  const email = z.string().email().max(191).safeParse((await ask('Adresse e-mail : ')).toLowerCase());
  if (!email.success) throw new Error('Adresse e-mail invalide.');
  const password = await askPassword('Mot de passe (12 caractères minimum, saisie masquée) : ');
  if (password.length < 12 || password.length > 128) throw new Error('Le mot de passe doit contenir entre 12 et 128 caractères.');
  const passwordConfirmation = await askPassword('Confirmer le mot de passe : ');
  if (password !== passwordConfirmation) throw new Error('Les mots de passe ne correspondent pas.');

  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async (tx) => {
    const existing = await tx.user.count({ where: { platformAdmin: true } });
    if (existing) throw new Error('Un compte Super Administrateur existe déjà. Utilisez la console plateforme.');
    await tx.platformSetting.create({
      data: { key: 'system.super_admin_bootstrapped', value: 'true' },
    });
    const user = await tx.user.create({
      data: { name: name || 'Super Administrateur', email: email.data, passwordHash, platformAdmin: true },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, action: 'PLATFORM_SUPER_ADMIN_BOOTSTRAP', result: 'SUCCESS', targetId: user.id },
    });
  });
  console.info('Compte Super Administrateur créé. Connectez-vous sur /connexion.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Création impossible.');
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());

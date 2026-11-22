import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

export function createDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL non configurée');
  const parsed = new URL(url);
  if (decodeURIComponent(parsed.username).toLowerCase() === 'root') throw new Error('Compte root interdit pour BLISS HÔTEL');
  const adapter = new PrismaMariaDb({ host: parsed.hostname, port: Number(parsed.port || 3306), user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: parsed.pathname.slice(1), connectionLimit: 5 });
  return new PrismaClient({ adapter });
}

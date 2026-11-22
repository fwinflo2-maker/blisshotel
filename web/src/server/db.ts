import 'server-only';
import { createDatabase } from '@/lib/database';
const globalDb = globalThis as unknown as { db?: ReturnType<typeof createDatabase> };
export const db = globalDb.db ?? createDatabase();
if (process.env.NODE_ENV !== 'production') globalDb.db = db;

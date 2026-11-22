import 'server-only';
import { db } from './db';
import { AppError } from './policy';

export async function hotelConfiguration() {
  const configuration = await db.hotelConfiguration.findUnique({ where: { id: 1 } });
  if (!configuration) throw new AppError(503, 'La configuration de BLISS HOTEL est indisponible.');
  return configuration;
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { hotelManagementApi } from '@/server/platform-admin';
import { hotelCurrencySchema } from '@/features/hotel/currency';

const settings = ['support_email'] as const;

export async function GET() {
  return hotelManagementApi(async (actor) => {
    const [stored, hotel, usdRate, database] = await Promise.all([
      db.platformSetting.findMany({ where: { key: { in: [...settings] } } }),
      db.hotelConfiguration.findUnique({ where: { id: 1 } }),
      db.currencyRate.findUnique({ where: { currency: 'USD' } }),
      db.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
    ]);
    const values = Object.fromEntries(stored.map(({ key, value }) => [key, value]));
    if (!hotel) throw new Error('La configuration de BLISS HOTEL est indisponible.');
    return NextResponse.json({
      settings: {
        support_email: values.support_email ?? '',
        hotel: {
          name: hotel.name,
          currency: hotel.currency,
          usdRate: usdRate ? {
            xafPerUnit: usdRate.xafPerUnit.toFixed(6),
            effectiveAt: usdRate.effectiveAt.toISOString(),
            source: usdRate.source,
          } : null,
          timezone: hotel.timezone,
          checkInTime: hotel.checkInTime,
          checkOutTime: hotel.checkOutTime,
          allowCheckoutWithBalance: hotel.allowCheckoutWithBalance,
        },
      },
      system: {
        version: process.env.npm_package_version ?? '0.1.0',
        environment: process.env.NODE_ENV ?? 'unknown',
        emailProvider: 'not_implemented',
        database: database[0]?.ok === 1 ? 'available' : 'unavailable',
      },
    });
  });
}

const schema = z.object({
  supportEmail: z.union([z.literal(''), z.string().trim().email().max(191)]),
  currency: hotelCurrencySchema,
  timezone: z.string().trim().min(1).max(64).refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
  checkInTime: z.union([z.literal(''), z.null(), z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)]),
  checkOutTime: z.union([z.literal(''), z.null(), z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)]),
  allowCheckoutWithBalance: z.boolean(),
});

export async function PATCH(request: Request) {
  return hotelManagementApi(async (actor) => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
    const previous = await db.platformSetting.findUnique({ where: { key: 'support_email' } });
    const previousHotel = await db.hotelConfiguration.findUnique({ where: { id: 1 } });
    if (!previousHotel) throw new Error('La configuration de BLISS HOTEL est indisponible.');
    await db.$transaction(async (tx) => {
      if (parsed.data.supportEmail) {
        await tx.platformSetting.upsert({
          where: { key: 'support_email' },
          update: { value: parsed.data.supportEmail, updatedBy: actor.id },
          create: { key: 'support_email', value: parsed.data.supportEmail, updatedBy: actor.id },
        });
      } else {
        await tx.platformSetting.deleteMany({ where: { key: 'support_email' } });
      }
      await tx.hotelConfiguration.update({
        where: { id: 1 },
        data: {
          currency: parsed.data.currency,
          timezone: parsed.data.timezone,
          checkInTime: parsed.data.checkInTime || null,
          checkOutTime: parsed.data.checkOutTime || null,
          allowCheckoutWithBalance: parsed.data.allowCheckoutWithBalance,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'PLATFORM_SETTINGS_UPDATE',
          result: 'SUCCESS',
          details: {
            supportEmail: { before: previous?.value ?? '', after: parsed.data.supportEmail },
            hotel: {
              before: {
                currency: previousHotel.currency,
                timezone: previousHotel.timezone,
                checkInTime: previousHotel.checkInTime,
                checkOutTime: previousHotel.checkOutTime,
                allowCheckoutWithBalance: previousHotel.allowCheckoutWithBalance,
              },
              after: {
                currency: parsed.data.currency,
                timezone: parsed.data.timezone,
                checkInTime: parsed.data.checkInTime || null,
                checkOutTime: parsed.data.checkOutTime || null,
                allowCheckoutWithBalance: parsed.data.allowCheckoutWithBalance,
              },
            },
          },
        },
      });
    });
    return NextResponse.json({ ok: true });
  });
}

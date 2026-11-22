import { NextResponse } from 'next/server';
import { db } from '@/server/db';

export async function GET() {
  const support = await db.platformSetting.findUnique({
    where: { key: 'support_email' },
    select: { value: true },
  });
  return NextResponse.json({ supportEmail: support?.value ?? null });
}

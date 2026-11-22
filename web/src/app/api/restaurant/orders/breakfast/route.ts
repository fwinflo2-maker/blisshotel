import { NextResponse } from 'next/server';

export const instant = false;

export async function POST() {
  return NextResponse.json(
    { error: 'Le petit-dejeuner se commande a la carte depuis le service restaurant.' },
    { status: 410 },
  );
}

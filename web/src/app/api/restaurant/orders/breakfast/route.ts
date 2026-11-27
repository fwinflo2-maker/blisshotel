import { NextResponse } from 'next/server';

export const instant = false;

export async function POST() {
  return NextResponse.json(
    { error: 'Le petit-déjeuner se commande à la carte depuis le service restaurant.' },
    { status: 410 },
  );
}

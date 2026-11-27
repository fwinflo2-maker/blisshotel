import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cookieName, cookieOptions, hashToken, newToken } from "@/server/auth";
import { db } from "@/server/db";

const schema = z.object({ email: z.string().trim().email().max(191), password: z.string().min(8).max(128) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Identifiants invalides." }, { status: 400 });
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateKey = createHash("sha256").update(`${ip}:${parsed.data.email.toLowerCase()}`).digest("hex");
  const now = new Date();
  const limited = await db.rateLimit.findUnique({ where: { key: rateKey } });
  if (limited && limited.expiresAt > now && limited.attempts >= 5) return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });

  const user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { role: { select: { code: true } } },
  });
  const valid = user?.active && await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid || !user) {
    await db.rateLimit.upsert({
      where: { key: rateKey },
      update: { attempts: { increment: 1 }, expiresAt: limited && limited.expiresAt > now ? limited.expiresAt : new Date(now.getTime() + 15 * 60 * 1000) },
      create: { key: rateKey, attempts: 1, expiresAt: new Date(now.getTime() + 15 * 60 * 1000) },
    });
    await db.auditLog.create({ data: { action: "AUTH_LOGIN", result: "FAILURE", details: { reason: "invalid_credentials", email: parsed.data.email.toLowerCase(), rateLimitCount: (limited?.attempts ?? 0) + 1 } } });
    return NextResponse.json({ error: "Email ou mot de passe incorrect." }, { status: 401 });
  }

  await db.rateLimit.deleteMany({ where: { key: rateKey } });
  const token = newToken();
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  await db.$transaction(async (tx) => {
    await tx.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } });
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "AUTH_LOGIN", result: "SUCCESS", details: { ip } } });
  });
  (await cookies()).set(cookieName, token, { ...cookieOptions, expires: expiresAt });
  const redirectTo = user.platformAdmin
    ? '/super-admin'
    : user.role?.code === 'OWNER'
      ? '/proprietaire'
      : user.role?.code === 'HOTEL_ADMIN'
        ? '/admin-hotel'
      : user.role?.code === 'RECEPTIONIST'
        ? '/reception'
        : user.role?.code === 'ACCOUNTANT'
          ? '/comptabilite'
          : user.role?.code === 'GENERAL_MANAGER'
            ? '/direction'
            : user.role?.code === 'MAINTENANCE_MANAGER'
              ? '/maintenance'
              : user.role?.code === 'RESTAURANT_MANAGER'
                ? '/restauration'
                : user.role?.code === 'BAR_SERVER'
                  ? '/bar-service'
            : ['HOUSEKEEPER', 'GOUVERNANTE'].includes(user.role?.code ?? '')
              ? '/housekeeping'
              : '/acces-refuse';
  return NextResponse.json({ ok: true, redirectTo });
}

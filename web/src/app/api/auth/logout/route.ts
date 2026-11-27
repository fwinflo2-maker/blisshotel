import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, cookieOptions, currentSession, hashToken } from "@/server/auth";
import { db } from "@/server/db";

export async function POST() {
  const session = await currentSession();
  const operatorCookie = process.env.NODE_ENV === 'production' ? '__Host-bliss-operator-session' : 'bliss-operator-session';
  const jar = await cookies();
  const operatorToken = jar.get(operatorCookie)?.value;
  if (session) {
    await db.session.deleteMany({ where: { tokenHash: session.tokenHash } });
    await db.auditLog.create({ data: { actorId: session.userId, action: "AUTH_LOGOUT", result: "SUCCESS" } });
  }
  if (session?.impersonatedById && operatorToken) {
    const operatorSession = await db.session.findUnique({ where: { tokenHash: hashToken(operatorToken) } });
    if (operatorSession?.userId === session.impersonatedById) await db.session.delete({ where: { id: operatorSession.id } });
  }
  jar.set(cookieName, "", { ...cookieOptions, expires: new Date(0) });
  jar.set(operatorCookie, "", { ...cookieOptions, expires: new Date(0) });
  return NextResponse.json({ ok: true });
}

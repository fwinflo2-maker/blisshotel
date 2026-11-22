import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, cookieOptions, currentSession } from "@/server/auth";
import { db } from "@/server/db";

export async function POST() {
  const session = await currentSession();
  if (session) {
    await db.session.delete({ where: { tokenHash: session.tokenHash } });
    await db.auditLog.create({ data: { actorId: session.userId, action: "AUTH_LOGOUT", result: "SUCCESS" } });
  }
  (await cookies()).set(cookieName, "", { ...cookieOptions, expires: new Date(0) });
  return NextResponse.json({ ok: true });
}

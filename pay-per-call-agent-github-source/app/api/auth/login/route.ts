import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, publicUser, type UserRecord } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { checkAuthRateLimit, clearLoginRateLimit, rateLimitResponse, readJsonRequest, sameOriginError } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return NextResponse.json({ error: "Server setup is incomplete. Generate SESSION_SECRET in .env.local and restart the server." }, { status: 500 });
  }
  try {
    const parsed = await readJsonRequest(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: { "Cache-Control": "no-store" } });
    const body = parsed.value as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    if (email.length > 254 || password.length > 72) return NextResponse.json({ error: "Email or password is too long." }, { status: 400 });

    const retryAfter = checkAuthRateLimit(request, "login", email);
    if (retryAfter) return rateLimitResponse(retryAfter);

    const user = db.prepare("SELECT id, email, password_hash, role, created_at FROM users WHERE email = ?").get(email) as UserRecord | undefined;
    const matches = user ? await bcrypt.compare(password, user.password_hash ?? "") : false;
    if (!user || !matches) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });

    clearLoginRateLimit(email);
    const token = await createSessionToken(user);
    const response = NextResponse.json({ user: publicUser(user) });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Login failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Could not log in. Check the server configuration and try again." }, { status: 500 });
  }
}

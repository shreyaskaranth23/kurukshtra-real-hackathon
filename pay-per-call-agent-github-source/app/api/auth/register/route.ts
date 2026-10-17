import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, publicUser, type UserRecord, type UserRole } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { checkAuthRateLimit, rateLimitResponse, readJsonRequest, sameOriginError } from "@/lib/security";

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
    const body = parsed.value as { email?: unknown; password?: unknown; role?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role as UserRole;

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8 || password.length > 72) {
      return NextResponse.json({ error: "Password must be between 8 and 72 characters." }, { status: 400 });
    }
    if (role !== "buyer" && role !== "host") {
      return NextResponse.json({ error: "Choose Buyer or Server Host." }, { status: 400 });
    }

    const retryAfter = checkAuthRateLimit(request, "register", email);
    if (retryAfter) return rateLimitResponse(retryAfter);

    const passwordHash = await bcrypt.hash(password, 12);
    let result: { lastInsertRowid: number | bigint };
    try {
      result = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)").run(email, passwordHash, role);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.email")) {
        return NextResponse.json({ error: "An account with this email already exists. Please log in." }, { status: 409 });
      }
      throw error;
    }

    const user = db.prepare("SELECT id, email, role, created_at FROM users WHERE id = ?").get(Number(result.lastInsertRowid)) as UserRecord;
    const token = await createSessionToken(user);
    const response = NextResponse.json({ user: publicUser(user) }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Registration failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Could not create the account. Check the server configuration and try again." }, { status: 500 });
  }
}

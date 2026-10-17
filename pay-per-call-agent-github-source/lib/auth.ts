import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db, type UserRecord } from "@/lib/db";

export const SESSION_COOKIE = "ppca_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function signingKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or too short. Follow the setup instructions in README.md.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: UserRecord) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuer("pay-per-call-agent")
    .setAudience("pay-per-call-agent-web")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(signingKey());
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export async function getCurrentUser(): Promise<UserRecord | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"],
      issuer: "pay-per-call-agent",
      audience: "pay-per-call-agent-web",
    });
    const id = Number(payload.sub);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    const user = db.prepare("SELECT id, email, role, created_at FROM users WHERE id = ?").get(id) as UserRecord | undefined;
    return user ?? null;
  } catch {
    return null;
  }
}

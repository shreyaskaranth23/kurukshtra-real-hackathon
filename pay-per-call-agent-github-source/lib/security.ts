import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export type AuthAction = "login" | "register";
type RateLimitRow = {
  bucket: string;
  attempts: number;
  window_started_at: number;
  blocked_until: number;
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Origin check for browser-driven mutations. This protects cookie-authenticated API
 * routes against cross-site requests. Browser fetches from this app send Origin.
 */
export function sameOriginError(request: Request): NextResponse | null {
  const source = request.headers.get("origin") || request.headers.get("referer");
  if (!source) {
    return NextResponse.json(
      { error: "Request origin could not be verified. Refresh the page and try again." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const sourceUrl = new URL(source);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || requestUrl.host;
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProtocol ? `${forwardedProtocol.replace(/:$/, "")}:` : requestUrl.protocol;
    const expectedOrigin = `${protocol}//${host}`;
    if (sourceUrl.origin !== expectedOrigin) {
      return NextResponse.json(
        { error: "Cross-origin requests are not allowed." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return null;
  } catch {
    return NextResponse.json(
      { error: "Request origin could not be verified." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function readJsonRequest(request: Request, maxBytes = 16 * 1024): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 | 415; error: string }
> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return { ok: false, status: 415, error: "Send this request as application/json." };
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413, error: "Request body is too large." };
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, status: 413, error: "Request body is too large." };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, status: 400, error: "Request body must contain valid JSON." };
  }
}

function clientIdentifier(request: Request) {
  // In production, deploy behind a trusted proxy that overwrites X-Forwarded-For.
  // Local development normally falls back to a single local bucket.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const candidate = forwarded || realIp || "local";
  return candidate.length <= 100 ? candidate : "invalid-forwarded-ip";
}

function bucketId(action: AuthAction, kind: "ip" | "email", value: string) {
  return `${action}:${kind}:${hash(value.toLowerCase())}`;
}

function consumeBucket(bucket: string, limit: number, windowMs: number) {
  const now = Date.now();
  const get = db.prepare("SELECT bucket, attempts, window_started_at, blocked_until FROM auth_rate_limits WHERE bucket = ?");
  const reset = db.prepare(`
    INSERT INTO auth_rate_limits (bucket, attempts, window_started_at, blocked_until)
    VALUES (?, 1, ?, 0)
    ON CONFLICT(bucket) DO UPDATE SET attempts = 1, window_started_at = excluded.window_started_at, blocked_until = 0
  `);
  const increment = db.prepare("UPDATE auth_rate_limits SET attempts = attempts + 1 WHERE bucket = ?");
  const block = db.prepare("UPDATE auth_rate_limits SET blocked_until = ? WHERE bucket = ?");

  const transaction = db.transaction(() => {
    const row = get.get(bucket) as RateLimitRow | undefined;
    if (!row || now - row.window_started_at >= windowMs || now < row.window_started_at) {
      reset.run(bucket, now);
      return 0;
    }
    if (row.blocked_until > now) return Math.max(1, Math.ceil((row.blocked_until - now) / 1000));
    if (row.attempts >= limit) {
      const retryAt = row.window_started_at + windowMs;
      block.run(retryAt, bucket);
      return Math.max(1, Math.ceil((retryAt - now) / 1000));
    }
    increment.run(bucket);
    return 0;
  });
  return transaction();
}

/** Returns Retry-After seconds, or null when this request may proceed. */
export function checkAuthRateLimit(request: Request, action: AuthAction, email: string) {
  // Keep one-off email attempts from making the local SQLite file grow forever.
  const now = Date.now();
  db.prepare("DELETE FROM auth_rate_limits WHERE window_started_at < ? AND blocked_until < ?")
    .run(now - 24 * ONE_HOUR, now);

  const ip = clientIdentifier(request);
  const normalizedEmail = email.trim().toLowerCase().slice(0, 254);
  const policies = action === "login"
    ? [
        { bucket: bucketId(action, "ip", ip), limit: 30, windowMs: FIFTEEN_MINUTES },
        { bucket: bucketId(action, "email", normalizedEmail), limit: 8, windowMs: FIFTEEN_MINUTES },
      ]
    : [
        { bucket: bucketId(action, "ip", ip), limit: 6, windowMs: ONE_HOUR },
        { bucket: bucketId(action, "email", normalizedEmail), limit: 3, windowMs: ONE_HOUR },
      ];

  let retryAfter = 0;
  for (const policy of policies) {
    retryAfter = Math.max(retryAfter, consumeBucket(policy.bucket, policy.limit, policy.windowMs));
  }
  return retryAfter || null;
}

export function clearLoginRateLimit(email: string) {
  const normalizedEmail = email.trim().toLowerCase().slice(0, 254);
  // Clear only the account-specific counter. Keep the IP counter so a successful
  // login to one account cannot reset failed attempts against other accounts.
  db.prepare("DELETE FROM auth_rate_limits WHERE bucket = ?").run(
    bucketId("login", "email", normalizedEmail),
  );
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many attempts. Please wait before trying again." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}

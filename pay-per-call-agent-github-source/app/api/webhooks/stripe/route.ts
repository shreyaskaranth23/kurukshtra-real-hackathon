import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { creditCompletedStripeTestCheckout, expireStripeCheckoutAttempt } from "@/lib/stripe-test-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 1_000_000;
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

type StripeObject = {
  id?: string;
  object?: string;
  mode?: string;
  livemode?: boolean;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string | undefined> | null;
};
type StripeEvent = {
  id: string;
  type: string;
  livemode?: boolean;
  data: { object: StripeObject };
};

function verifySignature(rawBody: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestampText = parts.find((part) => part.startsWith("t="))?.slice(2);
  const timestamp = Number(timestampText);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!Number.isSafeInteger(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !secret.startsWith("whsec_")) {
    return jsonError("Stripe webhook is not configured. Set STRIPE_WEBHOOK_SECRET in .env.local.", 503);
  }
  const signatureHeader = request.headers.get("stripe-signature") || "";
  if (!signatureHeader) return jsonError("Missing Stripe signature.", 400);

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) return jsonError("Webhook body is too large.", 413);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) return jsonError("Webhook body is too large.", 413);
  if (!verifySignature(rawBody, signatureHeader, secret)) return jsonError("Stripe signature verification failed.", 400);

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return jsonError("Webhook payload is invalid JSON.", 400);
  }
  if (!event || typeof event.id !== "string" || typeof event.type !== "string" || !event.data?.object) {
    return jsonError("Webhook payload is missing required event fields.", 400);
  }

  const session = event.data.object;
  // This endpoint is intentionally a TEST-mode only integration. Never credit from live-mode events.
  if (event.livemode !== false || session.livemode !== false) {
    return NextResponse.json({ received: true, ignored: "not-a-test-mode-event" }, { headers: { "Cache-Control": "no-store" } });
  }

  const metadata = session.metadata || {};
  const attemptId = Number(metadata.checkout_attempt_id);
  const userId = Number(metadata.user_id);

  if (event.type === "checkout.session.expired") {
    if (Number.isSafeInteger(attemptId) && attemptId > 0 && typeof session.id === "string") {
      expireStripeCheckoutAttempt(attemptId, session.id);
    }
    return NextResponse.json({ received: true, expired: true }, { headers: { "Cache-Control": "no-store" } });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true, ignored: true }, { headers: { "Cache-Control": "no-store" } });
  }

  // A redirect/query string is not proof of payment. Only signed, paid test events can credit.
  if (session.object !== "checkout.session" || session.mode !== "payment" || session.payment_status !== "paid") {
    return NextResponse.json({ received: true, ignored: "session-not-paid" }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!Number.isSafeInteger(attemptId) || attemptId < 1 || !Number.isSafeInteger(userId) || userId < 1 || typeof session.id !== "string") {
    return jsonError("Verified test session metadata is incomplete.", 400);
  }

  const amountCents = Number(metadata.amount_cents);
  const creditUnits = Number(metadata.credit_units);
  if (![500, 1000, 2500].includes(amountCents) || creditUnits !== amountCents * 10_000 || session.amount_total !== amountCents || session.currency?.toLowerCase() !== "usd") {
    return jsonError("Test Checkout amount or credit metadata did not match the allowed values.", 400);
  }

  try {
    const result = creditCompletedStripeTestCheckout({
      attemptId,
      userId,
      amountCents,
      creditUnits,
      sessionId: session.id,
      eventId: event.id,
    });
    return NextResponse.json({ received: true, result: result.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Stripe test webhook settlement failed", error instanceof Error ? error.message : "unknown error");
    return jsonError("Stripe event verified, but local test crediting failed. Stripe will retry this webhook.", 500);
  }
}

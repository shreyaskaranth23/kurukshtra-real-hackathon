import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readJsonRequest, sameOriginError } from "@/lib/security";
import { attachStripeSession, failStripeCheckoutAttempt, prepareStripeTestCheckout } from "@/lib/stripe-test-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_AMOUNTS = new Set([500, 1000, 2500]);

function appBaseUrl(request: Request) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (process.env.NODE_ENV === "production" && !configured) {
    throw new Error("APP_BASE_URL must be configured explicitly before running outside local development.");
  }
  const url = new URL(configured || new URL(request.url).origin);
  if (url.username || url.password || url.search || url.hash) throw new Error("APP_BASE_URL must be an origin URL without credentials, query, or hash.");
  if (url.pathname !== "/" && url.pathname !== "") throw new Error("APP_BASE_URL must not include a path.");
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new Error("Use HTTPS for APP_BASE_URL, except localhost during development.");
  return url.origin;
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (user.role !== "buyer") return NextResponse.json({ error: "Only Buyer accounts can open a test Checkout session." }, { status: 403, headers: { "Cache-Control": "no-store" } });

  const parsed = await readJsonRequest(request, 4 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: { "Cache-Control": "no-store" } });
  const body = parsed.value as { amountCents?: unknown };
  const amountCents = Number(body.amountCents);
  if (!Number.isSafeInteger(amountCents) || !ALLOWED_AMOUNTS.has(amountCents)) {
    return NextResponse.json({ error: "Choose a supported test top-up amount: $5, $10, or $25." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret || !secret.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Stripe is disabled until STRIPE_SECRET_KEY is set to a test-mode sk_test_ key in .env.local." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  let origin: string;
  try {
    origin = appBaseUrl(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "APP_BASE_URL is invalid." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  let attemptId: number;
  try {
    attemptId = prepareStripeTestCheckout(user.id, amountCents);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare the test checkout." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  const credits = amountCents * 10_000;
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("payment_method_types[0]", "card");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][product_data][name]", "Pay Per Call Agent — TEST credits");
  form.set("line_items[0][price_data][product_data][description]", "Test-mode purchase for a local prototype. Credits are non-redeemable and have no cash value.");
  form.set("line_items[0][price_data][unit_amount]", String(amountCents));
  form.set("line_items[0][quantity]", "1");
  form.set("client_reference_id", String(user.id));
  form.set("metadata[checkout_attempt_id]", String(attemptId));
  form.set("metadata[user_id]", String(user.id));
  form.set("metadata[amount_cents]", String(amountCents));
  form.set("metadata[credit_units]", String(credits));
  form.set("success_url", `${origin}/workspace/buyer?stripe=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/workspace/buyer?stripe=cancelled`);

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const session = await response.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !session.id || !session.url) {
      failStripeCheckoutAttempt(attemptId);
      console.error("Stripe test Checkout creation failed", { status: response.status, type: "stripe-api-error" });
      return NextResponse.json({ error: "Could not create Stripe test Checkout. Check the test key and Stripe account configuration." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const checkoutUrl = new URL(session.url);
    if (checkoutUrl.origin !== "https://checkout.stripe.com") {
      failStripeCheckoutAttempt(attemptId);
      return NextResponse.json({ error: "Stripe returned an unexpected Checkout URL." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    attachStripeSession(attemptId, session.id);
    return NextResponse.json({ url: session.url, mode: "stripe-test" }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    failStripeCheckoutAttempt(attemptId);
    console.error("Stripe test Checkout request failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not reach Stripe test Checkout. Check the network and try again." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

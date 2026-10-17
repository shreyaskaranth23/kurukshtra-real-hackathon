import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readJsonRequest, sameOriginError } from "@/lib/security";
import { addTestCredits, getTestPaymentDashboard, settleTestCall } from "@/lib/test-payments";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json(getTestPaymentDashboard(user.id, user.role), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load the sandbox payment dashboard." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const parsed = await readJsonRequest(request, 4 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: { "Cache-Control": "no-store" } });
  const body = parsed.value as { action?: unknown; requestId?: unknown; callId?: unknown };

  try {
    if (body.action === "fund") {
      if (user.role !== "buyer") return NextResponse.json({ error: "Only Buyer accounts can add sandbox test credits." }, { status: 403 });
      if (typeof body.requestId !== "string" || !/^[a-zA-Z0-9:_-]{8,80}$/.test(body.requestId)) {
        return NextResponse.json({ error: "A valid request id is required for idempotent test funding." }, { status: 400 });
      }
      const result = addTestCredits(user.id, body.requestId);
      return NextResponse.json({ ...getTestPaymentDashboard(user.id, user.role), funding: result.duplicate ? "already-processed" : "test-credits-added" }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "settle") {
      if (user.role !== "buyer") return NextResponse.json({ error: "Only Buyer accounts can initiate a sandbox call payment." }, { status: 403 });
      const callId = Number(body.callId);
      if (!Number.isSafeInteger(callId) || callId < 1) {
        return NextResponse.json({ error: "Choose a valid successful agent run." }, { status: 400 });
      }
      const result = settleTestCall(user.id, callId);
      return NextResponse.json({ ...getTestPaymentDashboard(user.id, user.role), settlement: result.duplicate ? "already-settled-in-sandbox" : "simulated-settlement-complete" }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ error: "Unknown sandbox payment action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The sandbox payment could not be completed.";
    const status = /insufficient test balance/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

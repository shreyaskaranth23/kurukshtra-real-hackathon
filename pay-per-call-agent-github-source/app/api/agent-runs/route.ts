import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAgentRun, listAgentRuns } from "@/lib/agent-runs";
import { sameOriginError } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  return NextResponse.json({ runs: listAgentRuns(user.id, user.role, 20), mode: "local-demo" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.role !== "buyer") return NextResponse.json({ error: "Only Buyer accounts can run marketplace agents." }, { status: 403 });

  try {
    const body = await request.json() as { serviceId?: unknown; input?: unknown };
    const serviceId = Number(body.serviceId);
    if (!Number.isSafeInteger(serviceId) || serviceId < 1) {
      return NextResponse.json({ error: "Choose a valid service listing." }, { status: 400 });
    }
    const run = await createAgentRun(user.id, serviceId, body.input);
    const note = run.mode === "live-api-no-payment"
      ? "Live external API response received. No payment was taken or settled."
      : "Local demo execution only. No external endpoint or payment was used.";
    return NextResponse.json({ run, note }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not run the local demo agent." }, { status: 400 });
  }
}

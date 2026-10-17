import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDemoCallStats, listDemoCalls, recordDemoCall } from "@/lib/demo-calls";
import { sameOriginError } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const role = user.role;
  const calls = listDemoCalls(user.id, role, 20);
  const stats = getDemoCallStats(user.id, role);
  return NextResponse.json({ calls, stats, mode: "simulation" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.role !== "buyer") return NextResponse.json({ error: "Only Buyer accounts can create demo requests." }, { status: 403 });

  try {
    const body = await request.json() as { serviceId?: unknown };
    const serviceId = Number(body.serviceId);
    if (!Number.isSafeInteger(serviceId) || serviceId < 1) {
      return NextResponse.json({ error: "Choose a valid service listing." }, { status: 400 });
    }
    const call = recordDemoCall(user.id, serviceId);
    const stats = getDemoCallStats(user.id, user.role);
    return NextResponse.json({ call, stats, mode: "simulation", note: "Recorded as a local demo only. No endpoint was called and no payment was sent." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record the demo request." }, { status: 400 });
  }
}

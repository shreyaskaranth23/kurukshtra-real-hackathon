import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getServiceApiSettingsForHost, saveServiceApiSettings } from "@/lib/api-secrets";
import { sameOriginError } from "@/lib/security";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

async function readServiceId(context: RouteContext): Promise<number | null> {
  const params = await context.params;
  const id = Number(params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.role !== "host") return NextResponse.json({ error: "Only hosts can view API configuration." }, { status: 403 });
  const serviceId = await readServiceId(context);
  if (!serviceId) return NextResponse.json({ error: "Invalid service ID." }, { status: 400 });
  const settings = getServiceApiSettingsForHost(user.id, serviceId);
  if (!settings) return NextResponse.json({ error: "Service not found or you do not own it." }, { status: 404 });
  return NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: RouteContext) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.role !== "host") return NextResponse.json({ error: "Only hosts can configure API execution." }, { status: 403 });
  const serviceId = await readServiceId(context);
  if (!serviceId) return NextResponse.json({ error: "Invalid service ID." }, { status: 400 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.liveEnabled !== "boolean") return NextResponse.json({ error: "Choose whether live API execution is enabled." }, { status: 400 });
    const apiKey = body.apiKey;
    if (apiKey !== undefined && (typeof apiKey !== "string" || apiKey.length > 1000 || /[\r\n\0]/.test(apiKey))) {
      return NextResponse.json({ error: "API key must be a single line and no longer than 1,000 characters." }, { status: 400 });
    }
    if (body.apiKeyHeader !== undefined && body.apiKeyHeader !== "authorization" && body.apiKeyHeader !== "x-api-key") {
      return NextResponse.json({ error: "Choose Authorization: Bearer or x-api-key authentication." }, { status: 400 });
    }
    if (body.clearApiKey !== undefined && typeof body.clearApiKey !== "boolean") return NextResponse.json({ error: "clearApiKey must be true or false." }, { status: 400 });
    const saved = saveServiceApiSettings(user.id, serviceId, {
      liveEnabled: body.liveEnabled,
      apiKey: typeof apiKey === "string" ? apiKey : undefined,
      apiKeyHeader: body.apiKeyHeader === "x-api-key" ? "x-api-key" : "authorization",
      clearApiKey: body.clearApiKey === true,
    });
    if (!saved) return NextResponse.json({ error: "Service not found or you do not own it." }, { status: 404 });
    return NextResponse.json({ settings: getServiceApiSettingsForHost(user.id, serviceId), message: "API execution settings saved. Secrets are never returned to the browser." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save API settings." }, { status: 400 });
  }
}

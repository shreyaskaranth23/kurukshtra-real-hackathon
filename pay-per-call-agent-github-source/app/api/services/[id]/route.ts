import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicService, updateService, validateServiceInput } from "@/lib/service-registry";
import { sameOriginError } from "@/lib/security";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function getServiceId(context: RouteContext): Promise<number | null> {
  const params = await context.params;
  const id = Number(params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, context: RouteContext) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.role !== "host") return NextResponse.json({ error: "Only hosts can edit services." }, { status: 403 });
  const id = await getServiceId(context);
  if (!id) return NextResponse.json({ error: "Invalid service ID." }, { status: 400 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = validateServiceInput(body);
    const row = updateService(user.id, id, input);
    if (!row) return NextResponse.json({ error: "Service not found or you do not own it." }, { status: 404 });
    return NextResponse.json({ service: publicService(row) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update service." }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.role !== "host") return NextResponse.json({ error: "Only hosts can manage services." }, { status: 403 });
  const id = await getServiceId(context);
  if (!id) return NextResponse.json({ error: "Invalid service ID." }, { status: 400 });
  try {
    const body = await request.json() as { isActive?: unknown };
    if (typeof body.isActive !== "boolean") return NextResponse.json({ error: "isActive must be true or false." }, { status: 400 });
    const result = db.prepare("UPDATE services SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND owner_id = ?")
      .run(body.isActive ? 1 : 0, id, user.id);
    if (result.changes === 0) return NextResponse.json({ error: "Service not found or you do not own it." }, { status: 404 });
    const row = db.prepare("SELECT * FROM services WHERE id = ? AND owner_id = ?").get(id, user.id) as Parameters<typeof publicService>[0];
    return NextResponse.json({ service: publicService(row) });
  } catch {
    return NextResponse.json({ error: "Could not update service status." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.role !== "host") return NextResponse.json({ error: "Only hosts can delete services." }, { status: 403 });
  const id = await getServiceId(context);
  if (!id) return NextResponse.json({ error: "Invalid service ID." }, { status: 400 });
  const result = db.prepare("DELETE FROM services WHERE id = ? AND owner_id = ?").run(id, user.id);
  if (result.changes === 0) return NextResponse.json({ error: "Service not found or you do not own it." }, { status: 404 });
  return NextResponse.json({ success: true });
}

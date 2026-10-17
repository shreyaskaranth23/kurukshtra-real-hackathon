import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { insertService, listMarketplaceServices, parseUsdcToUnits, publicService, validateServiceInput } from "@/lib/service-registry";
import { sameOriginError } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to search the service registry." }, { status: 401 });
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 120);
  const category = url.searchParams.get("category") || "all";
  const maxPrice = url.searchParams.get("maxPrice");
  let maxPriceUnits: number | null = null;
  if (maxPrice) {
    maxPriceUnits = parseUsdcToUnits(maxPrice);
    if (maxPriceUnits === null) return NextResponse.json({ error: "Maximum price must be between 0.000001 and 0.10 USDC." }, { status: 400 });
  }
  if (category !== "all" && !["data", "inference", "scraping"].includes(category)) {
    return NextResponse.json({ error: "Unknown service category." }, { status: 400 });
  }

  let services = listMarketplaceServices(user.id);
  if (category !== "all") services = services.filter((service) => service.category === category);
  if (maxPriceUnits !== null) services = services.filter((service) => service.priceUnits <= maxPriceUnits!);
  if (q) services = services.filter((service) => `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(q));
  return NextResponse.json({ services, count: services.length, network: "eip155:84532" });
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in before publishing a service." }, { status: 401 });
  if (user.role !== "host") return NextResponse.json({ error: "Only Server Host accounts can publish services." }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const input = validateServiceInput(body);
    const row = insertService(user.id, input);
    return NextResponse.json({ service: publicService(row) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not publish this service.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

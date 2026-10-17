import { db } from "@/lib/db";
import { isServiceLiveEnabled } from "@/lib/api-secrets";

export const SERVICE_CATEGORIES = ["data", "inference", "scraping"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export type ServiceListing = {
  id: number;
  ownerId: number;
  hostLabel: string;
  name: string;
  category: ServiceCategory;
  endpointUrl: string;
  priceUnits: number;
  priceUsdc: string;
  network: "eip155:84532";
  payTo: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  timezone: string;
  maxCallsPerHour: number;
  maxConcurrency: number;
  isActive: boolean;
  externalEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type ServiceRow = {
  id: number; owner_id: number; name: string; category: ServiceCategory;
  endpoint_url: string; price_units: number; network: string; pay_to: string;
  input_schema: string; output_schema: string; description: string;
  working_hours_start: string; working_hours_end: string; timezone: string;
  max_calls_per_hour: number; max_concurrency: number; is_active: number;
  created_at: string; updated_at: string;
};

export function formatUsdc(units: number): string {
  const whole = Math.floor(units / 1_000_000);
  const fraction = String(units % 1_000_000).padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function parseUsdcToUnits(value: unknown): number | null {
  const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) return null;
  const [wholeRaw, fractionRaw = ""] = raw.split(".");
  const whole = Number(wholeRaw);
  const fraction = Number((fractionRaw + "000000").slice(0, 6));
  if (!Number.isSafeInteger(whole)) return null;
  const units = whole * 1_000_000 + fraction;
  if (!Number.isSafeInteger(units) || units < 1 || units > 100_000) return null;
  return units;
}

function asJsonObject(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Stored service schema is not a JSON object.");
  return parsed as Record<string, unknown>;
}

export function publicService(row: ServiceRow): ServiceListing {
  return {
    id: row.id,
    ownerId: row.owner_id,
    hostLabel: `Agent host #${row.owner_id}`,
    name: row.name,
    category: row.category,
    endpointUrl: row.endpoint_url,
    priceUnits: row.price_units,
    priceUsdc: formatUsdc(row.price_units),
    network: "eip155:84532",
    payTo: row.pay_to,
    inputSchema: asJsonObject(row.input_schema),
    outputSchema: asJsonObject(row.output_schema),
    description: row.description,
    workingHoursStart: row.working_hours_start,
    workingHoursEnd: row.working_hours_end,
    timezone: row.timezone,
    maxCallsPerHour: row.max_calls_per_hour,
    maxConcurrency: row.max_concurrency,
    isActive: row.is_active === 1,
    externalEnabled: isServiceLiveEnabled(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listHostServices(ownerId: number): ServiceListing[] {
  const rows = db.prepare("SELECT * FROM services WHERE owner_id = ? ORDER BY updated_at DESC, id DESC").all(ownerId) as ServiceRow[];
  return rows.map(publicService);
}

export function listMarketplaceServices(ownerId: number): ServiceListing[] {
  const rows = db.prepare(
    "SELECT * FROM services WHERE is_active = 1 AND owner_id <> ? ORDER BY updated_at DESC, id DESC LIMIT 200"
  ).all(ownerId) as ServiceRow[];
  return rows.map(publicService);
}

export type ServiceInput = {
  name: string;
  category: ServiceCategory;
  endpointUrl: string;
  priceUnits: number;
  payTo: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  timezone: string;
  maxCallsPerHour: number;
  maxConcurrency: number;
};

function readJsonSchema(value: unknown, field: string): Record<string, unknown> {
  let result: unknown = value;
  if (typeof value === "string") {
    try { result = JSON.parse(value); } catch { throw new Error(`${field} must be valid JSON.`); }
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error(`${field} must be a JSON Schema object.`);
  const schema = result as Record<string, unknown>;
  if (schema.type !== "object") throw new Error(`${field} must have a top-level "type": "object".`);
  if (schema.properties !== undefined && (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties))) {
    throw new Error(`${field}.properties must be an object.`);
  }
  return schema;
}

function readInt(value: unknown, field: string, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${field} must be an integer between ${min} and ${max}.`);
  return parsed;
}

function validTime(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${field} must use 24-hour HH:MM format.`);
  return value;
}

export function validateServiceInput(body: Record<string, unknown>): ServiceInput {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 3 || name.length > 80) throw new Error("Service name must contain 3 to 80 characters.");

  if (typeof body.category !== "string" || !SERVICE_CATEGORIES.includes(body.category as ServiceCategory)) {
    throw new Error("Choose data, inference, or scraping as the service category.");
  }

  const endpointRaw = typeof body.endpointUrl === "string" ? body.endpointUrl.trim() : "";
  if (endpointRaw.length > 2048) throw new Error("Endpoint URL is too long.");
  let endpoint: URL;
  try { endpoint = new URL(endpointRaw); } catch { throw new Error("Enter a valid endpoint URL, including https:// or http://."); }
  if (!(["http:", "https:"].includes(endpoint.protocol)) || endpoint.username || endpoint.password) {
    throw new Error("Endpoint URL must use HTTP or HTTPS and must not include credentials.");
  }

  const priceUnits = parseUsdcToUnits(body.priceUsdc ?? body.price);
  if (priceUnits === null) throw new Error("Price must be greater than 0 and no more than 0.10 USDC, with up to 6 decimal places.");

  const payTo = typeof body.payTo === "string" ? body.payTo.trim() : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) throw new Error("Enter a valid 0x Ethereum receiving address for Base Sepolia.");

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length < 10 || description.length > 1000) throw new Error("Description must contain 10 to 1,000 characters.");

  const workingHoursStart = validTime(body.workingHoursStart ?? "00:00", "Working hours start");
  const workingHoursEnd = validTime(body.workingHoursEnd ?? "23:59", "Working hours end");
  if (workingHoursStart === workingHoursEnd) throw new Error("Working hours start and end cannot be the same.");
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "Asia/Kolkata";
  if (timezone.length > 80) throw new Error("Timezone must be no longer than 80 characters.");

  return {
    name,
    category: body.category as ServiceCategory,
    endpointUrl: endpoint.toString(),
    priceUnits,
    payTo,
    inputSchema: readJsonSchema(body.inputSchema, "Input schema"),
    outputSchema: readJsonSchema(body.outputSchema, "Output schema"),
    description,
    workingHoursStart,
    workingHoursEnd,
    timezone,
    maxCallsPerHour: readInt(body.maxCallsPerHour ?? 100, "Maximum calls per hour", 1, 100000),
    maxConcurrency: readInt(body.maxConcurrency ?? 3, "Maximum concurrency", 1, 1000),
  };
}

export function insertService(ownerId: number, input: ServiceInput) {
  const result = db.prepare(`
    INSERT INTO services (
      owner_id, name, category, endpoint_url, price_units, network, pay_to,
      input_schema, output_schema, description, working_hours_start, working_hours_end,
      timezone, max_calls_per_hour, max_concurrency
    ) VALUES (?, ?, ?, ?, ?, 'eip155:84532', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ownerId, input.name, input.category, input.endpointUrl, input.priceUnits, input.payTo,
    JSON.stringify(input.inputSchema), JSON.stringify(input.outputSchema), input.description,
    input.workingHoursStart, input.workingHoursEnd, input.timezone, input.maxCallsPerHour, input.maxConcurrency,
  );
  return db.prepare("SELECT * FROM services WHERE id = ?").get(Number(result.lastInsertRowid)) as ServiceRow;
}

export function updateService(ownerId: number, serviceId: number, input: ServiceInput) {
  const result = db.prepare(`
    UPDATE services SET name = ?, category = ?, endpoint_url = ?, price_units = ?, pay_to = ?,
      input_schema = ?, output_schema = ?, description = ?, working_hours_start = ?, working_hours_end = ?,
      timezone = ?, max_calls_per_hour = ?, max_concurrency = ?, updated_at = datetime('now')
    WHERE id = ? AND owner_id = ?
  `).run(
    input.name, input.category, input.endpointUrl, input.priceUnits, input.payTo,
    JSON.stringify(input.inputSchema), JSON.stringify(input.outputSchema), input.description,
    input.workingHoursStart, input.workingHoursEnd, input.timezone, input.maxCallsPerHour, input.maxConcurrency,
    serviceId, ownerId,
  );
  if (result.changes === 0) return null;
  return db.prepare("SELECT * FROM services WHERE id = ? AND owner_id = ?").get(serviceId, ownerId) as ServiceRow | undefined ?? null;
}

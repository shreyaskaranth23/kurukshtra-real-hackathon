import { db } from "@/lib/db";
import { recordDemoCall } from "@/lib/demo-calls";
import { formatUsdc } from "@/lib/service-registry";
import { getServiceRuntimeSettings } from "@/lib/api-secrets";
import { assertSafePublicHttpsEndpoint, readTextWithLimit } from "@/lib/endpoint-security";

type JsonObject = Record<string, unknown>;
type AgentRunRow = {
  call_id: number;
  service_id: number | null;
  service_name: string;
  buyer_id: number;
  buyer_email: string;
  host_id: number;
  host_email: string;
  price_units: number;
  input_json: string;
  output_json: string;
  duration_ms: number;
  created_at: string;
  execution_mode: "local-demo" | "live-api-no-payment";
};
type ServiceForRun = {
  id: number;
  owner_id: number;
  name: string;
  category: string;
  input_schema: string;
  output_schema: string;
  is_active: number;
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseSchema(raw: string, field: string): JsonObject {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`The saved ${field} is not valid JSON.`); }
  if (!isObject(parsed)) throw new Error(`The saved ${field} must be a JSON object.`);
  return parsed;
}

function matchesType(value: unknown, type: unknown): boolean {
  if (typeof type !== "string") return true;
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "array": return Array.isArray(value);
    case "object": return isObject(value);
    case "null": return value === null;
    default: return true;
  }
}

function validateInput(input: unknown, schema: JsonObject): asserts input is JsonObject {
  if (!isObject(input)) throw new Error("Input must be a JSON object, such as {\"text\": \"Hello\"}.");
  if (JSON.stringify(input).length > 16000) throw new Error("Input is too large. Keep the JSON under 16 KB.");
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
  for (const key of required) {
    if (!(key in input)) throw new Error(`Missing required field: ${key}`);
  }
  for (const [key, value] of Object.entries(input)) {
    const rule = properties[key];
    if (!rule) {
      if (schema.additionalProperties === false) throw new Error(`Unknown input field: ${key}`);
      continue;
    }
    if (isObject(rule) && !matchesType(value, rule.type)) {
      throw new Error(`Field "${key}" must be of type ${String(rule.type)}.`);
    }
  }
}

function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (isObject(value)) return Object.values(value).flatMap(allStrings);
  return [];
}

function shortSummary(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "No text was provided to summarize.";
  const sentences = normalized.match(/[^.!?]+[.!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [normalized];
  const excerpt = sentences.slice(0, 2).join(" ");
  return excerpt.length > 360 ? `${excerpt.slice(0, 357).trimEnd()}...` : excerpt;
}

function keywords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  const stop = new Set(["this", "that", "with", "from", "have", "were", "been", "your", "into", "about", "will", "would", "there", "their", "they", "them", "then", "than", "when", "what", "which", "while", "also", "some", "more", "such", "only"]);
  const counts = new Map<string, number>();
  for (const word of words) if (!stop.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([word]) => word);
}

function sampleForType(type: unknown): unknown {
  if (type === "string") return "Local demo response. No external API was called.";
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return true;
  if (type === "array") return [];
  if (type === "object") return {};
  if (type === "null") return null;
  return "Local demo response.";
}

function runLocally(name: string, category: string, input: JsonObject, schema: JsonObject): JsonObject {
  const sourceText = allStrings(input).join(" ").trim();
  const props = isObject(schema.properties) ? schema.properties : {};
  const output: JsonObject = {};
  const isSummary = /summar|summary|tldr/i.test(name) || "summary" in props;
  const isKeywords = /keyword|extract/i.test(name) || "keywords" in props;

  for (const [key, rawRule] of Object.entries(props)) {
    const rule = isObject(rawRule) ? rawRule : {};
    const lower = key.toLowerCase();
    if (lower.includes("summary") || lower === "tldr") output[key] = shortSummary(sourceText);
    else if (lower.includes("keyword")) output[key] = keywords(sourceText);
    else if (lower.includes("status")) output[key] = "simulated";
    else if (lower.includes("message")) output[key] = "Local demo completed. No external endpoint was contacted.";
    else if (lower.includes("count") || lower.includes("total")) output[key] = Object.keys(input).length;
    else if (["result", "response", "answer", "output", "content"].includes(lower)) {
      output[key] = isSummary ? shortSummary(sourceText) : `Local demo result for ${name}. External API execution is disabled.`;
    } else if (lower.includes("query") || lower.includes("input")) output[key] = input;
    else if (isKeywords && rule.type === "array") output[key] = keywords(sourceText);
    else output[key] = sampleForType(rule.type);
  }

  if (Object.keys(output).length === 0) {
    if (category === "inference" || isSummary) return { summary: shortSummary(sourceText), mode: "local-demo" };
    if (category === "scraping") return { status: "simulated", message: "Live scraping is disabled in local demo mode.", query: sourceText.slice(0, 240) };
    return { status: "simulated", message: "Local demo completed. No live data source was queried.", receivedFields: Object.keys(input).length };
  }
  return output;
}

function parseJsonObject(raw: string): JsonObject {
  try {
    const value: unknown = JSON.parse(raw);
    return isObject(value) ? value : {};
  } catch { return {}; }
}

function redactSecrets(value: unknown, secret: string | null): unknown {
  if (typeof value === "string") return secret ? value.split(secret).join("[REDACTED]") : value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, secret));
  if (isObject(value)) {
    const result: JsonObject = {};
    for (const [key, child] of Object.entries(value)) {
      if (/(^authorization$|^x-api-key$|api[_-]?key|access[_-]?token|client[_-]?secret)/i.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSecrets(child, secret);
      }
    }
    return result;
  }
  return value;
}

function publicRun(row: AgentRunRow) {
  return {
    id: row.call_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    buyerId: row.buyer_id,
    buyerEmail: row.buyer_email,
    hostId: row.host_id,
    hostEmail: row.host_email,
    priceUsdc: formatUsdc(row.price_units),
    input: parseJsonObject(row.input_json),
    output: parseJsonObject(row.output_json),
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    mode: row.execution_mode,
  };
}

const runSelect = `
  SELECT c.id AS call_id, c.service_id, c.service_name, c.buyer_id, buyer.email AS buyer_email,
         c.host_id, host.email AS host_email, c.price_units,
         r.input_json, r.output_json, r.duration_ms, r.execution_mode, r.created_at
  FROM agent_run_details r
  JOIN demo_calls c ON c.id = r.call_id
  JOIN users buyer ON buyer.id = c.buyer_id
  JOIN users host ON host.id = c.host_id
`;

export function getAgentRunById(callId: number) {
  const row = db.prepare(`${runSelect} WHERE c.id = ?`).get(callId) as AgentRunRow | undefined;
  return row ? publicRun(row) : null;
}

export function listAgentRuns(userId: number, role: "buyer" | "host", limit = 10) {
  const column = role === "buyer" ? "c.buyer_id" : "c.host_id";
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 10));
  const rows = db.prepare(`${runSelect} WHERE ${column} = ? ORDER BY c.id DESC LIMIT ?`).all(userId, safeLimit) as AgentRunRow[];
  return rows.map(publicRun);
}

export async function createAgentRun(buyerId: number, serviceId: number, inputValue: unknown) {
  const service = db.prepare(`
    SELECT id, owner_id, name, category, endpoint_url, input_schema, output_schema, is_active, max_calls_per_hour
    FROM services WHERE id = ?
  `).get(serviceId) as (ServiceForRun & { endpoint_url: string; max_calls_per_hour: number }) | undefined;
  if (!service || service.is_active !== 1) throw new Error("This service is not available right now.");
  if (service.owner_id === buyerId) throw new Error("You cannot run your own service as a buyer.");

  const inputSchema = parseSchema(service.input_schema, "input schema");
  const outputSchema = parseSchema(service.output_schema, "output schema");
  validateInput(inputValue, inputSchema);
  const jsonInput = JSON.stringify(inputValue);
  const settings = getServiceRuntimeSettings(service.id);
  const started = Date.now();
  let output: JsonObject;
  let executionMode: "local-demo" | "live-api-no-payment" = "local-demo";

  if (settings.liveEnabled) {
    const endpoint = await assertSafePublicHttpsEndpoint(service.endpoint_url);
    const recent = db.prepare(`
      SELECT COUNT(*) AS count
      FROM demo_calls c JOIN agent_run_details r ON r.call_id = c.id
      WHERE c.service_id = ? AND c.created_at >= datetime('now', '-1 hour')
        AND r.execution_mode = 'live-api-no-payment'
    `).get(service.id) as { count: number };
    if (recent.count >= service.max_calls_per_hour) throw new Error("This service has reached its configured hourly call limit. Try again later.");
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (settings.apiKey) {
      headers[settings.apiKeyHeader === "x-api-key" ? "x-api-key" : "authorization"] = settings.apiKeyHeader === "x-api-key"
        ? settings.apiKey
        : `Bearer ${settings.apiKey}`;
    }
    let response: Response;
    try {
      response = await fetch(endpoint.toString(), {
        method: "POST",
        headers,
        body: jsonInput,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") throw new Error("The external API timed out after 10 seconds.");
      throw new Error("Could not reach the external API. Check the endpoint and network, then retry.");
    }
    if (response.status >= 300 && response.status < 400) throw new Error("The external API returned a redirect. Redirects are blocked for safety; save the final HTTPS endpoint instead.");
    if (!response.ok) throw new Error(`The external API returned HTTP ${response.status}. Check the endpoint and API credentials.`);
    const contentType = response.headers.get("content-type") || "";
    if (!/json/i.test(contentType)) throw new Error("The external API did not return JSON. Configure an endpoint that responds with JSON.");
    const rawOutput = await readTextWithLimit(response, 64 * 1024);
    try {
      const parsed: unknown = JSON.parse(rawOutput);
      if (!isObject(parsed)) throw new Error("The API response must be a JSON object.");
      output = redactSecrets(parsed, settings.apiKey) as JsonObject;
    } catch (error) {
      if (error instanceof Error && error.message === "The API response must be a JSON object.") throw error;
      throw new Error("The external API returned invalid JSON.");
    }
    executionMode = "live-api-no-payment";
  } else {
    output = runLocally(service.name, service.category, inputValue as JsonObject, outputSchema);
  }

  const durationMs = Math.max(1, Date.now() - started);
  const transaction = db.transaction(() => {
    const call = recordDemoCall(buyerId, serviceId);
    db.prepare(`
      INSERT INTO agent_run_details (call_id, input_json, output_json, duration_ms, execution_mode)
      VALUES (?, ?, ?, ?, ?)
    `).run(call.id, jsonInput, JSON.stringify(output), durationMs, executionMode);
    db.prepare(`
      INSERT INTO usage_ledger (
        call_id, service_id, service_name, buyer_id, host_id, amount_units,
        currency, execution_mode, settlement_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'USDC', ?, 'not-billed')
    `).run(call.id, serviceId, call.serviceName, buyerId, call.hostId, call.priceUnits, executionMode);
    return call.id;
  });
  const callId = transaction();
  const run = getAgentRunById(callId);
  if (!run) throw new Error("The run was recorded but its result could not be loaded.");
  return run;
}

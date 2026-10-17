import crypto from "node:crypto";
import { db } from "@/lib/db";

type ApiHeader = "authorization" | "x-api-key";
type SettingsRow = { service_id: number; owner_id: number; encrypted_api_key: string | null; api_key_header: ApiHeader; live_enabled: number };

function encryptionKey(): Buffer {
  const raw = process.env.LOCAL_API_KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error("The API-key encryption key is missing. Restart npm run dev so local setup can create it.");
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) throw new Error("LOCAL_API_KEY_ENCRYPTION_KEY must decode to 32 bytes.");
  return key;
}

function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptSecret(ciphertext: string | null): string | null {
  if (!ciphertext) return null;
  const [ivRaw, tagRaw, dataRaw] = ciphertext.split(".");
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error("Saved API credential has an invalid format.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString("utf8");
}

function readRow(serviceId: number): SettingsRow | undefined {
  return db.prepare("SELECT service_id, owner_id, encrypted_api_key, api_key_header, live_enabled FROM service_api_settings WHERE service_id = ?")
    .get(serviceId) as SettingsRow | undefined;
}

export function getServiceApiSettingsForHost(ownerId: number, serviceId: number) {
  const owned = db.prepare("SELECT id FROM services WHERE id = ? AND owner_id = ?").get(serviceId, ownerId);
  if (!owned) return null;
  const row = readRow(serviceId);
  return { liveEnabled: row?.live_enabled === 1, hasApiKey: Boolean(row?.encrypted_api_key), apiKeyHeader: row?.api_key_header ?? "authorization" as ApiHeader };
}

export function saveServiceApiSettings(ownerId: number, serviceId: number, value: { liveEnabled: boolean; apiKey?: string; apiKeyHeader?: ApiHeader; clearApiKey?: boolean }) {
  const owned = db.prepare("SELECT id FROM services WHERE id = ? AND owner_id = ?").get(serviceId, ownerId);
  if (!owned) return false;
  let encryptedApiKey: string | null | undefined;
  if (value.clearApiKey) encryptedApiKey = null;
  else if (typeof value.apiKey === "string" && value.apiKey.trim()) encryptedApiKey = encryptSecret(value.apiKey.trim());
  const header: ApiHeader = value.apiKeyHeader === "x-api-key" ? "x-api-key" : "authorization";
  const old = readRow(serviceId);
  const nextKey = encryptedApiKey === undefined ? old?.encrypted_api_key ?? null : encryptedApiKey;
  db.prepare(`
    INSERT INTO service_api_settings (service_id, owner_id, encrypted_api_key, api_key_header, live_enabled)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(service_id) DO UPDATE SET owner_id = excluded.owner_id,
      encrypted_api_key = excluded.encrypted_api_key, api_key_header = excluded.api_key_header,
      live_enabled = excluded.live_enabled, updated_at = datetime('now')
  `).run(serviceId, ownerId, nextKey, header, value.liveEnabled ? 1 : 0);
  return true;
}

export function getServiceRuntimeSettings(serviceId: number) {
  const row = readRow(serviceId);
  if (!row || row.live_enabled !== 1) return { liveEnabled: false as const, apiKey: null, apiKeyHeader: "authorization" as ApiHeader };
  return { liveEnabled: true as const, apiKey: decryptSecret(row.encrypted_api_key), apiKeyHeader: row.api_key_header };
}

export function isServiceLiveEnabled(serviceId: number): boolean {
  const row = db.prepare("SELECT live_enabled FROM service_api_settings WHERE service_id = ?").get(serviceId) as { live_enabled: number } | undefined;
  return row?.live_enabled === 1;
}

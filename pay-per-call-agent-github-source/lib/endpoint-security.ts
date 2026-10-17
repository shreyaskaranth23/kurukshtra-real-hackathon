import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const parts = address.split(".").map(Number);
    const [a, b, c] = parts;
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a === 255) return false;
    return true;
  }
  if (family === 6) {
    const ip = address.toLowerCase();
    if (ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb") || ip.startsWith("ff") || ip.startsWith("2001:db8:")) return false;
    const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);
    // Global unicast IPv6 space (2000::/3); reject special-purpose and non-global ranges.
    return /^2[0-9a-f]{3}:/.test(ip) || /^3[0-9a-f]{3}:/.test(ip);
  }
  return false;
}

export async function assertSafePublicHttpsEndpoint(rawUrl: string): Promise<URL> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("The host's endpoint URL is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Live API execution requires a public HTTPS URL without credentials or fragments.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".test") || hostname.endsWith(".example") || hostname.endsWith(".invalid") || hostname === "metadata.google.internal") {
    throw new Error("The endpoint host is local, reserved, or internal. Use a public HTTPS API URL.");
  }
  if (isIP(hostname)) throw new Error("For safety, live API endpoints must use a public DNS hostname rather than an IP address.");
  let addresses: { address: string; family: number }[];
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new Error("Could not resolve the API hostname. Check the public domain and try again."); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error("The API hostname resolves to a private or reserved address, so the request was blocked.");
  }
  return url;
}

export async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`The API response is larger than ${Math.round(maxBytes / 1024)} KB.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

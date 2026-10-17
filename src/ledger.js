import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

const ledgerPath = path.resolve("data", "ledger.jsonl");

export async function recordRun(entry) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.dirname(ledgerPath), { recursive: true });

  await appendFile(
    ledgerPath,
    JSON.stringify({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    }) + "\n",
    "utf8"
  );
}

export async function getRecentRuns(limit = 50) {
  try {
    const contents = await readFile(ledgerPath, "utf8");
    return contents
      .split("\n")
      .filter(Boolean)
      .slice(-Math.min(Math.max(limit, 1), 100))
      .reverse()
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
'@ | Set-Content -Encoding utf8 src\ledger.js
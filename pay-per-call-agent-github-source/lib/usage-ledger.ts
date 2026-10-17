import { db, type UserRole } from "@/lib/db";
import { formatUsdc } from "@/lib/service-registry";

type UsageSummaryRow = {
  total_runs: number;
  total_units: number;
  month_runs: number;
  month_units: number;
  live_api_calls: number;
  local_demo_runs: number;
};

type UsageEntryRow = {
  id: number;
  call_id: number;
  service_id: number | null;
  service_name: string;
  buyer_id: number;
  buyer_email: string;
  host_id: number;
  host_email: string;
  amount_units: number;
  currency: "USDC";
  execution_mode: "local-demo" | "live-api-no-payment";
  settlement_status: "not-billed";
  created_at: string;
};

export type UsageSummary = {
  totalRuns: number;
  totalEstimateUsdc: string;
  monthRuns: number;
  monthEstimateUsdc: string;
  liveApiCalls: number;
  localDemoRuns: number;
};

export type UsageEntry = {
  id: number;
  callId: number;
  serviceId: number | null;
  serviceName: string;
  buyerId: number;
  buyerEmail: string;
  hostId: number;
  hostEmail: string;
  amountUsdc: string;
  currency: "USDC";
  mode: "local-demo" | "live-api-no-payment";
  settlementStatus: "not-billed";
  createdAt: string;
};

function roleColumn(role: UserRole): "buyer_id" | "host_id" {
  return role === "buyer" ? "buyer_id" : "host_id";
}

export function getUsageSummary(userId: number, role: UserRole): UsageSummary {
  const column = roleColumn(role);
  const row = db.prepare(`
    SELECT COUNT(*) AS total_runs,
           COALESCE(SUM(amount_units), 0) AS total_units,
           SUM(CASE WHEN created_at >= datetime('now', 'start of month') THEN 1 ELSE 0 END) AS month_runs,
           COALESCE(SUM(CASE WHEN created_at >= datetime('now', 'start of month') THEN amount_units ELSE 0 END), 0) AS month_units,
           SUM(CASE WHEN execution_mode = 'live-api-no-payment' THEN 1 ELSE 0 END) AS live_api_calls,
           SUM(CASE WHEN execution_mode = 'local-demo' THEN 1 ELSE 0 END) AS local_demo_runs
    FROM usage_ledger WHERE ${column} = ?
  `).get(userId) as UsageSummaryRow;
  return {
    totalRuns: row.total_runs ?? 0,
    totalEstimateUsdc: formatUsdc(row.total_units ?? 0),
    monthRuns: row.month_runs ?? 0,
    monthEstimateUsdc: formatUsdc(row.month_units ?? 0),
    liveApiCalls: row.live_api_calls ?? 0,
    localDemoRuns: row.local_demo_runs ?? 0,
  };
}

export function listUsageEntries(userId: number, role: UserRole, limit = 10): UsageEntry[] {
  const column = roleColumn(role);
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 10));
  const rows = db.prepare(`
    SELECT l.id, l.call_id, l.service_id, l.service_name,
           l.buyer_id, buyer.email AS buyer_email,
           l.host_id, host.email AS host_email,
           l.amount_units, l.currency, l.execution_mode, l.settlement_status, l.created_at
    FROM usage_ledger l
    JOIN users buyer ON buyer.id = l.buyer_id
    JOIN users host ON host.id = l.host_id
    WHERE l.${column} = ?
    ORDER BY l.id DESC LIMIT ?
  `).all(userId, safeLimit) as UsageEntryRow[];
  return rows.map((row) => ({
    id: row.id,
    callId: row.call_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    buyerId: row.buyer_id,
    buyerEmail: row.buyer_email,
    hostId: row.host_id,
    hostEmail: row.host_email,
    amountUsdc: formatUsdc(row.amount_units),
    currency: row.currency,
    mode: row.execution_mode,
    settlementStatus: row.settlement_status,
    createdAt: row.created_at,
  }));
}

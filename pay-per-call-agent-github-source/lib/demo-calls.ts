import { db } from "@/lib/db";
import { formatUsdc } from "@/lib/service-registry";

export type DemoCall = {
  id: number;
  serviceId: number | null;
  serviceName: string;
  buyerId: number;
  buyerEmail: string;
  hostId: number;
  hostEmail: string;
  priceUnits: number;
  priceUsdc: string;
  status: "simulated";
  createdAt: string;
};

type DemoCallRow = {
  id: number;
  service_id: number | null;
  service_name: string;
  buyer_id: number;
  buyer_email: string;
  host_id: number;
  host_email: string;
  price_units: number;
  status: "simulated";
  created_at: string;
};

function publicDemoCall(row: DemoCallRow): DemoCall {
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    buyerId: row.buyer_id,
    buyerEmail: row.buyer_email,
    hostId: row.host_id,
    hostEmail: row.host_email,
    priceUnits: row.price_units,
    priceUsdc: formatUsdc(row.price_units),
    status: "simulated",
    createdAt: row.created_at,
  };
}

const selectCall = `
  SELECT c.id, c.service_id, c.service_name, c.buyer_id, buyer.email AS buyer_email,
         c.host_id, host.email AS host_email, c.price_units, c.status, c.created_at
  FROM demo_calls c
  JOIN users buyer ON buyer.id = c.buyer_id
  JOIN users host ON host.id = c.host_id
`;

export function recordDemoCall(buyerId: number, serviceId: number): DemoCall {
  const service = db.prepare(`
    SELECT id, owner_id, name, price_units, is_active
    FROM services WHERE id = ?
  `).get(serviceId) as { id: number; owner_id: number; name: string; price_units: number; is_active: number } | undefined;

  if (!service || service.is_active !== 1) throw new Error("This service is no longer active.");
  if (service.owner_id === buyerId) throw new Error("You cannot request a demo call for your own service.");

  const result = db.prepare(`
    INSERT INTO demo_calls (service_id, service_name, buyer_id, host_id, price_units, status)
    VALUES (?, ?, ?, ?, ?, 'simulated')
  `).run(service.id, service.name, buyerId, service.owner_id, service.price_units);

  const row = db.prepare(`${selectCall} WHERE c.id = ?`).get(Number(result.lastInsertRowid)) as DemoCallRow;
  return publicDemoCall(row);
}

export function listDemoCalls(userId: number, role: "buyer" | "host", limit = 10): DemoCall[] {
  const column = role === "buyer" ? "c.buyer_id" : "c.host_id";
  const rows = db.prepare(`${selectCall} WHERE ${column} = ? ORDER BY c.id DESC LIMIT ?`).all(userId, limit) as DemoCallRow[];
  return rows.map(publicDemoCall);
}

export function getDemoCallStats(userId: number, role: "buyer" | "host") {
  const column = role === "buyer" ? "buyer_id" : "host_id";
  const row = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(price_units), 0) AS total_units
    FROM demo_calls WHERE ${column} = ?
  `).get(userId) as { count: number; total_units: number };
  return { count: row.count, totalUnits: row.total_units, totalUsdc: formatUsdc(row.total_units) };
}

import { randomUUID } from "node:crypto";
import { db, type UserRole } from "@/lib/db";
import { formatUsdc } from "@/lib/service-registry";

const TEST_CREDIT_UNITS = 10_000_000; // 10.000000 USDC, test-only
const TEST_FUNDING_CAP_UNITS = 100_000_000; // At most 100 test USDC minted per Buyer

export type TestPaymentTransaction = {
  id: number;
  reference: string;
  kind: "test-funding" | "agent-call";
  amountUsdc: string;
  serviceName: string;
  otherParty: string;
  callId: number | null;
  createdAt: string;
  status: "simulated-completed";
  network: "LOCAL-SANDBOX";
};

type WalletRow = { user_id: number; balance_units: number; total_funded_units: number };
type PaymentRow = {
  id: number;
  reference: string;
  kind: "test-funding" | "agent-call";
  buyer_id: number;
  buyer_email: string;
  host_id: number | null;
  host_email: string | null;
  call_id: number | null;
  service_name: string;
  amount_units: number;
  network: "LOCAL-SANDBOX";
  status: "simulated-completed";
  created_at: string;
};
type SuccessfulCallRow = {
  call_id: number;
  buyer_id: number;
  host_id: number;
  service_name: string;
  amount_units: number;
};

function ensureWallet(userId: number) {
  db.prepare("INSERT OR IGNORE INTO test_wallets (user_id) VALUES (?)").run(userId);
}

function getWalletRow(userId: number): WalletRow {
  ensureWallet(userId);
  const row = db.prepare(
    "SELECT user_id, balance_units, total_funded_units FROM test_wallets WHERE user_id = ?",
  ).get(userId) as WalletRow | undefined;
  if (!row) throw new Error("Could not load the local test wallet.");
  return row;
}

function toPublicTransaction(row: PaymentRow, role: UserRole): TestPaymentTransaction {
  return {
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    amountUsdc: formatUsdc(row.amount_units),
    serviceName: row.service_name,
    otherParty: row.kind === "test-funding"
      ? "Local test credit source"
      : role === "buyer" ? (row.host_email ?? "Host account") : row.buyer_email,
    callId: row.call_id,
    createdAt: row.created_at,
    status: row.status,
    network: row.network,
  };
}

const paymentSelect = `
  SELECT t.id, t.reference, t.kind, t.buyer_id, buyer.email AS buyer_email,
         t.host_id, host.email AS host_email, t.call_id, t.service_name,
         t.amount_units, t.network, t.status, t.created_at
  FROM test_payment_transactions t
  JOIN users buyer ON buyer.id = t.buyer_id
  LEFT JOIN users host ON host.id = t.host_id
`;

export function getTestPaymentDashboard(userId: number, role: UserRole) {
  const wallet = getWalletRow(userId);
  const isBuyer = role === "buyer";
  const totalRow = isBuyer
    ? db.prepare(`SELECT COALESCE(SUM(amount_units), 0) AS total FROM test_payment_transactions WHERE buyer_id = ? AND kind = 'agent-call'`).get(userId) as { total: number }
    : db.prepare(`SELECT COALESCE(SUM(amount_units), 0) AS total FROM test_payment_transactions WHERE host_id = ? AND kind = 'agent-call'`).get(userId) as { total: number };
  const column = isBuyer ? "buyer_id" : "host_id";
  const rows = db.prepare(`${paymentSelect} WHERE t.${column} = ? ORDER BY t.id DESC LIMIT 12`).all(userId) as PaymentRow[];
  const paidCallIds = isBuyer
    ? (db.prepare("SELECT call_id FROM test_payment_transactions WHERE buyer_id = ? AND call_id IS NOT NULL").all(userId) as Array<{ call_id: number }>).map((row) => row.call_id)
    : [];

  return {
    wallet: {
      balanceUsdc: formatUsdc(wallet.balance_units),
      totalFundedUsdc: formatUsdc(wallet.total_funded_units),
      totalPaidUsdc: isBuyer ? formatUsdc(totalRow.total) : "0",
      totalReceivedUsdc: isBuyer ? "0" : formatUsdc(totalRow.total),
      fundingCapReached: wallet.total_funded_units >= TEST_FUNDING_CAP_UNITS,
      fundingCapUsdc: formatUsdc(TEST_FUNDING_CAP_UNITS),
    },
    transactions: rows.map((row) => toPublicTransaction(row, role)),
    paidCallIds,
    sandboxOnly: true as const,
  };
}

export function addTestCredits(userId: number, idempotencyToken: string) {
  const idempotencyKey = `fund:${userId}:${idempotencyToken}`;
  const perform = db.transaction(() => {
    const existing = db.prepare("SELECT id FROM test_payment_transactions WHERE idempotency_key = ?").get(idempotencyKey) as { id: number } | undefined;
    if (existing) return { transactionId: existing.id, duplicate: true };

    const wallet = getWalletRow(userId);
    const pendingStripe = db.prepare(`
      SELECT COALESCE(SUM(credit_units), 0) AS reserved
      FROM stripe_test_checkouts
      WHERE user_id = ? AND status = 'pending' AND created_at >= datetime('now', '-1 hour')
    `).get(userId) as { reserved: number };
    if (wallet.total_funded_units + pendingStripe.reserved + TEST_CREDIT_UNITS > TEST_FUNDING_CAP_UNITS) {
      throw new Error("This Buyer has reached or reserved the 100 test USDC funding limit.");
    }
    const balanceAfter = wallet.balance_units + TEST_CREDIT_UNITS;
    db.prepare(`UPDATE test_wallets SET balance_units = ?, total_funded_units = total_funded_units + ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(balanceAfter, TEST_CREDIT_UNITS, userId);
    const info = db.prepare(`
      INSERT INTO test_payment_transactions (reference, idempotency_key, kind, buyer_id, host_id, call_id, service_name, amount_units)
      VALUES (?, ?, 'test-funding', ?, NULL, NULL, 'Test USDC credit', ?)
    `).run(`SANDBOX-${randomUUID()}`, idempotencyKey, userId, TEST_CREDIT_UNITS);
    const transactionId = Number(info.lastInsertRowid);
    db.prepare(`
      INSERT INTO test_payment_entries (transaction_id, account_user_id, direction, amount_units, balance_after_units, memo)
      VALUES (?, ?, 'credit', ?, ?, 'Local sandbox credit; not redeemable')
    `).run(transactionId, userId, TEST_CREDIT_UNITS, balanceAfter);
    return { transactionId, duplicate: false };
  });
  const result = perform.immediate();
  return result;
}

export function settleTestCall(buyerId: number, callId: number) {
  const perform = db.transaction(() => {
    const call = db.prepare(`
      SELECT c.id AS call_id, c.buyer_id, c.host_id, c.service_name, COALESCE(l.amount_units, c.price_units) AS amount_units
      FROM demo_calls c
      JOIN agent_run_details r ON r.call_id = c.id
      LEFT JOIN usage_ledger l ON l.call_id = c.id
      WHERE c.id = ?
    `).get(callId) as SuccessfulCallRow | undefined;
    if (!call) throw new Error("That successful agent run was not found.");
    if (call.buyer_id !== buyerId) throw new Error("You can only make a test payment for your own agent runs.");

    const existing = db.prepare(`${paymentSelect} WHERE t.call_id = ?`).get(callId) as PaymentRow | undefined;
    if (existing) return { transactionId: existing.id, duplicate: true };

    ensureWallet(call.buyer_id);
    ensureWallet(call.host_id);
    const buyerWallet = getWalletRow(call.buyer_id);
    if (buyerWallet.balance_units < call.amount_units) {
      throw new Error(`Insufficient test balance. Add test credits first. Required: ${formatUsdc(call.amount_units)} USDC.`);
    }
    const hostWallet = getWalletRow(call.host_id);
    const buyerAfter = buyerWallet.balance_units - call.amount_units;
    const hostAfter = hostWallet.balance_units + call.amount_units;
    const idempotencyKey = `settle-call:${callId}`;

    db.prepare(`UPDATE test_wallets SET balance_units = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(buyerAfter, call.buyer_id);
    db.prepare(`UPDATE test_wallets SET balance_units = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(hostAfter, call.host_id);
    const info = db.prepare(`
      INSERT INTO test_payment_transactions (reference, idempotency_key, kind, buyer_id, host_id, call_id, service_name, amount_units)
      VALUES (?, ?, 'agent-call', ?, ?, ?, ?, ?)
    `).run(`SANDBOX-${randomUUID()}`, idempotencyKey, call.buyer_id, call.host_id, call.call_id, call.service_name, call.amount_units);
    const transactionId = Number(info.lastInsertRowid);
    db.prepare(`
      INSERT INTO test_payment_entries (transaction_id, account_user_id, direction, amount_units, balance_after_units, memo)
      VALUES (?, ?, 'debit', ?, ?, 'Simulated Buyer payment; not real USDC')
    `).run(transactionId, call.buyer_id, call.amount_units, buyerAfter);
    db.prepare(`
      INSERT INTO test_payment_entries (transaction_id, account_user_id, direction, amount_units, balance_after_units, memo)
      VALUES (?, ?, 'credit', ?, ?, 'Simulated Host receipt; not redeemable')
    `).run(transactionId, call.host_id, call.amount_units, hostAfter);
    return { transactionId, duplicate: false };
  });
  const result = perform.immediate();
  return result;
}

import { db } from "@/lib/db";
import { formatUsdc } from "@/lib/service-registry";

const TEST_FUNDING_CAP_UNITS = 100_000_000; // 100 test credits in 6-decimal units
const ALLOWED_AMOUNT_CENTS = new Set([500, 1000, 2500]);

export type StripeCheckoutAttempt = {
  id: number;
  stripe_session_id: string | null;
  stripe_event_id: string | null;
  user_id: number;
  amount_cents: number;
  credit_units: number;
  status: "pending" | "credited" | "failed" | "cap-exceeded";
};

export function prepareStripeTestCheckout(userId: number, amountCents: number) {
  if (!ALLOWED_AMOUNT_CENTS.has(amountCents)) throw new Error("Choose one of the offered test top-up amounts.");
  const creditUnits = amountCents * 10_000; // $1.00 maps to 1.000000 local test credits
  const perform = db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO test_wallets (user_id) VALUES (?)").run(userId);
    const wallet = db.prepare("SELECT total_funded_units FROM test_wallets WHERE user_id = ?")
      .get(userId) as { total_funded_units: number } | undefined;
    if (!wallet) throw new Error("Could not load your test wallet.");
    const pending = db.prepare(`
      SELECT COALESCE(SUM(credit_units), 0) AS reserved
      FROM stripe_test_checkouts
      WHERE user_id = ? AND status = 'pending' AND created_at >= datetime('now', '-1 hour')
    `).get(userId) as { reserved: number };
    if (wallet.total_funded_units + pending.reserved + creditUnits > TEST_FUNDING_CAP_UNITS) {
      throw new Error("This test top-up would exceed your 100 test-credit lifetime cap. Use a smaller amount or settle existing test credits.");
    }
    const info = db.prepare(`
      INSERT INTO stripe_test_checkouts (user_id, amount_cents, credit_units, status)
      VALUES (?, ?, ?, 'pending')
    `).run(userId, amountCents, creditUnits);
    return Number(info.lastInsertRowid);
  });
  return perform.immediate();
}

export function attachStripeSession(attemptId: number, sessionId: string) {
  const result = db.prepare(`
    UPDATE stripe_test_checkouts
    SET stripe_session_id = COALESCE(stripe_session_id, ?), updated_at = datetime('now')
    WHERE id = ? AND status = 'pending' AND (stripe_session_id IS NULL OR stripe_session_id = ?)
  `).run(sessionId, attemptId, sessionId);
  if (result.changes !== 1) throw new Error("Could not associate the test Checkout session with its local attempt.");
}

export function failStripeCheckoutAttempt(attemptId: number) {
  db.prepare(`
    UPDATE stripe_test_checkouts SET status = 'failed', updated_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(attemptId);
}

export function expireStripeCheckoutAttempt(attemptId: number, sessionId: string) {
  db.prepare(`
    UPDATE stripe_test_checkouts
    SET stripe_session_id = COALESCE(stripe_session_id, ?), status = 'failed', updated_at = datetime('now')
    WHERE id = ? AND status = 'pending' AND (stripe_session_id IS NULL OR stripe_session_id = ?)
  `).run(sessionId, attemptId, sessionId);
}

export function creditCompletedStripeTestCheckout(input: {
  attemptId: number;
  userId: number;
  amountCents: number;
  creditUnits: number;
  sessionId: string;
  eventId: string;
}) {
  const perform = db.transaction(() => {
    const attempt = db.prepare(`
      SELECT id, stripe_session_id, stripe_event_id, user_id, amount_cents, credit_units, status
      FROM stripe_test_checkouts WHERE id = ?
    `).get(input.attemptId) as StripeCheckoutAttempt | undefined;
    if (!attempt) throw new Error("The local Checkout attempt was not found.");
    if (attempt.user_id !== input.userId || attempt.amount_cents !== input.amountCents || attempt.credit_units !== input.creditUnits) {
      throw new Error("Stripe test Checkout metadata did not match the stored attempt.");
    }
    if (attempt.stripe_session_id && attempt.stripe_session_id !== input.sessionId) {
      throw new Error("The Stripe session does not match the stored attempt.");
    }
    if (attempt.status === "credited") return { status: "already-credited" as const };
    if (attempt.status !== "pending") return { status: "not-creditable" as const };

    const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(input.userId) as { id: number; role: string } | undefined;
    if (!user || user.role !== "buyer") throw new Error("Only an existing Buyer account can receive test credits.");

    db.prepare("INSERT OR IGNORE INTO test_wallets (user_id) VALUES (?)").run(input.userId);
    const wallet = db.prepare("SELECT balance_units, total_funded_units FROM test_wallets WHERE user_id = ?")
      .get(input.userId) as { balance_units: number; total_funded_units: number } | undefined;
    if (!wallet) throw new Error("Could not load the test wallet.");

    if (wallet.total_funded_units + input.creditUnits > TEST_FUNDING_CAP_UNITS) {
      db.prepare(`
        UPDATE stripe_test_checkouts
        SET stripe_session_id = ?, stripe_event_id = ?, status = 'cap-exceeded', updated_at = datetime('now')
        WHERE id = ? AND status = 'pending'
      `).run(input.sessionId, input.eventId, input.attemptId);
      return { status: "cap-exceeded" as const };
    }

    const nextBalance = wallet.balance_units + input.creditUnits;
    db.prepare(`
      UPDATE test_wallets
      SET balance_units = ?, total_funded_units = total_funded_units + ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(nextBalance, input.creditUnits, input.userId);

    const dollars = (input.amountCents / 100).toFixed(2);
    const info = db.prepare(`
      INSERT INTO test_payment_transactions
        (reference, idempotency_key, kind, buyer_id, host_id, call_id, service_name, amount_units, network, status)
      VALUES (?, ?, 'test-funding', ?, NULL, NULL, ?, ?, 'LOCAL-SANDBOX', 'simulated-completed')
    `).run(
      `STRIPE-TEST-${input.sessionId}`,
      `stripe-test-fund:${input.sessionId}`,
      input.userId,
      `Stripe test checkout ($${dollars})`,
      input.creditUnits,
    );
    db.prepare(`
      INSERT INTO test_payment_entries
        (transaction_id, account_user_id, direction, amount_units, balance_after_units, memo)
      VALUES (?, ?, 'credit', ?, ?, 'Stripe test-mode Checkout; non-redeemable local test credits')
    `).run(Number(info.lastInsertRowid), input.userId, input.creditUnits, nextBalance);

    db.prepare(`
      UPDATE stripe_test_checkouts
      SET stripe_session_id = ?, stripe_event_id = ?, status = 'credited', updated_at = datetime('now'), credited_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(input.sessionId, input.eventId, input.attemptId);

    return { status: "credited" as const, balanceUsdc: formatUsdc(nextBalance) };
  });
  return perform.immediate();
}

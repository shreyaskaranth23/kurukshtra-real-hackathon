import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const globalForDb = globalThis as unknown as { ppcaDb?: Database.Database };

function createDatabase() {
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "pay-per-call-agent.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('buyer', 'host')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('data', 'inference', 'scraping')),
      endpoint_url TEXT NOT NULL,
      price_units INTEGER NOT NULL CHECK (price_units > 0 AND price_units <= 100000),
      network TEXT NOT NULL DEFAULT 'eip155:84532',
      pay_to TEXT NOT NULL,
      input_schema TEXT NOT NULL,
      output_schema TEXT NOT NULL,
      description TEXT NOT NULL,
      working_hours_start TEXT NOT NULL DEFAULT '00:00',
      working_hours_end TEXT NOT NULL DEFAULT '23:59',
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      max_calls_per_hour INTEGER NOT NULL DEFAULT 100 CHECK (max_calls_per_hour BETWEEN 1 AND 100000),
      max_concurrency INTEGER NOT NULL DEFAULT 3 CHECK (max_concurrency BETWEEN 1 AND 1000),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_services_active_category_price
      ON services(is_active, category, price_units);
    CREATE INDEX IF NOT EXISTS idx_services_owner ON services(owner_id);

    CREATE TABLE IF NOT EXISTS demo_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
      service_name TEXT NOT NULL,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      price_units INTEGER NOT NULL CHECK (price_units > 0),
      status TEXT NOT NULL DEFAULT 'simulated' CHECK (status = 'simulated'),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_demo_calls_buyer ON demo_calls(buyer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_demo_calls_host ON demo_calls(host_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS agent_run_details (
      call_id INTEGER PRIMARY KEY REFERENCES demo_calls(id) ON DELETE CASCADE,
      input_json TEXT NOT NULL,
      output_json TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      execution_mode TEXT NOT NULL DEFAULT 'local-demo',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS service_api_settings (
      service_id INTEGER PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      encrypted_api_key TEXT,
      api_key_header TEXT NOT NULL DEFAULT 'authorization' CHECK (api_key_header IN ('authorization', 'x-api-key')),
      live_enabled INTEGER NOT NULL DEFAULT 0 CHECK (live_enabled IN (0, 1)),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Immutable per-run usage snapshot. This is metering only, not a payment ledger.
    CREATE TABLE IF NOT EXISTS usage_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id INTEGER NOT NULL UNIQUE REFERENCES demo_calls(id) ON DELETE CASCADE,
      service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
      service_name TEXT NOT NULL,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_units INTEGER NOT NULL CHECK (amount_units > 0),
      currency TEXT NOT NULL DEFAULT 'USDC' CHECK (currency = 'USDC'),
      execution_mode TEXT NOT NULL CHECK (execution_mode IN ('local-demo', 'live-api-no-payment')),
      settlement_status TEXT NOT NULL DEFAULT 'not-billed' CHECK (settlement_status = 'not-billed'),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_buyer_date ON usage_ledger(buyer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_host_date ON usage_ledger(host_id, created_at DESC);

    -- Persistent local-demo rate limits. Keys are one-way hashes rather than raw emails/IPs.
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      bucket TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      window_started_at INTEGER NOT NULL,
      blocked_until INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window ON auth_rate_limits(window_started_at);

    -- Phase 7: local-only test balance and simulated payment ledger.
    -- No blockchain or real-money provider is connected to these tables.
    CREATE TABLE IF NOT EXISTS test_wallets (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance_units INTEGER NOT NULL DEFAULT 0 CHECK (balance_units >= 0),
      total_funded_units INTEGER NOT NULL DEFAULT 0 CHECK (total_funded_units >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS test_payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('test-funding', 'agent-call')),
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      host_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      call_id INTEGER UNIQUE REFERENCES demo_calls(id) ON DELETE CASCADE,
      service_name TEXT NOT NULL,
      amount_units INTEGER NOT NULL CHECK (amount_units > 0),
      network TEXT NOT NULL DEFAULT 'LOCAL-SANDBOX' CHECK (network = 'LOCAL-SANDBOX'),
      status TEXT NOT NULL DEFAULT 'simulated-completed' CHECK (status = 'simulated-completed'),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (kind = 'test-funding' AND host_id IS NULL AND call_id IS NULL)
        OR (kind = 'agent-call' AND host_id IS NOT NULL AND call_id IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_test_payments_buyer ON test_payment_transactions(buyer_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_test_payments_host ON test_payment_transactions(host_id, id DESC);

    CREATE TABLE IF NOT EXISTS test_payment_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES test_payment_transactions(id) ON DELETE CASCADE,
      account_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
      amount_units INTEGER NOT NULL CHECK (amount_units > 0),
      balance_after_units INTEGER NOT NULL CHECK (balance_after_units >= 0),
      memo TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(transaction_id, account_user_id, direction)
    );
    CREATE INDEX IF NOT EXISTS idx_test_payment_entries_account ON test_payment_entries(account_user_id, id DESC);

    -- Phase 8: Stripe TEST-MODE Checkout attempts. This never records live-mode payments.
    CREATE TABLE IF NOT EXISTS stripe_test_checkouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stripe_session_id TEXT UNIQUE,
      stripe_event_id TEXT UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL CHECK (amount_cents IN (500, 1000, 2500)),
      credit_units INTEGER NOT NULL CHECK (credit_units > 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'failed', 'cap-exceeded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      credited_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stripe_test_checkouts_user ON stripe_test_checkouts(user_id, id DESC);
  `);
  db.exec("INSERT OR IGNORE INTO test_wallets (user_id) SELECT id FROM users");
  // Forward-compatible migration for databases created by Phase 2/3.
  const runColumns = db.pragma("table_info(agent_run_details)") as Array<{ name: string }>;
  if (!runColumns.some((column) => column.name === "execution_mode")) {
    db.exec("ALTER TABLE agent_run_details ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'local-demo'");
  }
  // Backfill prior successful runs so the Phase 5 usage view includes existing history.
  db.exec(`
    INSERT OR IGNORE INTO usage_ledger (
      call_id, service_id, service_name, buyer_id, host_id, amount_units,
      currency, execution_mode, settlement_status, created_at
    )
    SELECT c.id, c.service_id, c.service_name, c.buyer_id, c.host_id, c.price_units,
           'USDC',
           CASE WHEN r.execution_mode = 'live-api-no-payment' THEN 'live-api-no-payment' ELSE 'local-demo' END,
           'not-billed', COALESCE(r.created_at, c.created_at)
    FROM agent_run_details r
    JOIN demo_calls c ON c.id = r.call_id
  `);
  return db;
}

export const db = globalForDb.ppcaDb ?? createDatabase();
if (process.env.NODE_ENV !== "production") globalForDb.ppcaDb = db;

export type UserRole = "buyer" | "host";
export type UserRecord = {
  id: number;
  email: string;
  password_hash?: string;
  role: UserRole;
  created_at?: string;
};

export function publicUser(user: UserRecord) {
  return { id: user.id, email: user.email, role: user.role };
}

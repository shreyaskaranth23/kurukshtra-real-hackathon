import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

function envValue(name) {
  const line = envText.split(/\r?\n/).find((entry) => entry.trim().startsWith(`${name}=`));
  if (!line) return '';
  return line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
}

let sessionSecret = envValue('SESSION_SECRET');
if (sessionSecret.length < 32) {
  sessionSecret = crypto.randomBytes(48).toString('base64url');
  const lines = envText.split(/\r?\n/).filter((line) => !line.trim().startsWith('SESSION_SECRET='));
  envText = lines.join('\n').replace(/\n*$/, '');
  envText += `${envText ? '\n' : ''}SESSION_SECRET=${sessionSecret}\n`;
  fs.writeFileSync(envPath, envText, { mode: 0o600 });
  console.log('Created a local SESSION_SECRET in .env.local');
}

let apiEncryptionKey = envValue('LOCAL_API_KEY_ENCRYPTION_KEY');
if (Buffer.from(apiEncryptionKey, 'base64url').length !== 32) {
  apiEncryptionKey = crypto.randomBytes(32).toString('base64url');
  const lines = envText.split(/\r?\n/).filter((line) => !line.trim().startsWith('LOCAL_API_KEY_ENCRYPTION_KEY='));
  envText = lines.join('\n').replace(/\n*$/, '');
  envText += `${envText ? '\n' : ''}LOCAL_API_KEY_ENCRYPTION_KEY=${apiEncryptionKey}\n`;
  fs.writeFileSync(envPath, envText, { mode: 0o600 });
  console.log('Created a local encryption key for host API credentials in .env.local');
}

const configuredDbPath = process.env.DATABASE_PATH || envValue('DATABASE_PATH');
const dbPath = configuredDbPath
  ? (path.isAbsolute(configuredDbPath) ? configuredDbPath : path.resolve(root, configuredDbPath))
  : path.join(root, 'data', 'pay-per-call-agent.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
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
`);
const runColumns = db.pragma('table_info(agent_run_details)');
if (!runColumns.some((column) => column.name === 'execution_mode')) {
  db.exec("ALTER TABLE agent_run_details ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'local-demo'");
}
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

const demoUsers = [
  { email: 'buyer@demo.com', password: 'BuyerDemo123!', role: 'buyer' },
  { email: 'host@demo.com', password: 'HostDemo123!', role: 'host' },
];
const upsert = db.prepare(`
  INSERT INTO users (email, password_hash, role) VALUES (@email, @password_hash, @role)
  ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role
`);
for (const user of demoUsers) {
  upsert.run({ email: user.email, password_hash: await bcrypt.hash(user.password, 12), role: user.role });
}
db.exec("INSERT OR IGNORE INTO test_wallets (user_id) SELECT id FROM users");

// Create one clearly-labelled registry example so the Buyer workspace is useful on first launch.
// It is never called by the local demo-call feature and never triggers any payment.
const host = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'host'").get('host@demo.com');
if (host) {
  const existingCount = db.prepare("SELECT COUNT(*) AS count FROM services WHERE owner_id = ?").get(host.id);
  if (existingCount.count === 0) {
    db.prepare(`
      INSERT INTO services (
        owner_id, name, category, endpoint_url, price_units, network, pay_to,
        input_schema, output_schema, description, working_hours_start, working_hours_end,
        timezone, max_calls_per_hour, max_concurrency, is_active
      ) VALUES (?, ?, 'inference', ?, 1000, 'eip155:84532', ?, ?, ?, ?, '00:00', '23:59', 'Asia/Kolkata', 100, 3, 1)
    `).run(
      host.id,
      'Demo Text Summarizer',
      'https://example.com/demo-text-summarizer',
      '0x1111111111111111111111111111111111111111',
      JSON.stringify({ type: 'object', properties: { text: { type: 'string', description: 'Text to summarize' } }, required: ['text'] }),
      JSON.stringify({ type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] }),
      'Example registry listing for testing the Buyer-to-Host demo request workflow. This listing does not execute a real summarizer.'
    );
    console.log('Seeded Demo Text Summarizer listing for the Server Host demo account.');
  }
}
db.close();
console.log('Local demo accounts are ready:');
console.log('  Buyer:       buyer@demo.com / BuyerDemo123!');
console.log('  Server Host: host@demo.com / HostDemo123!');

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
const readEnv = () => {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
};
const env = readEnv();
const placeholder = (value) => !value || /YOUR_|replace-with|replace_with|your_test_key|your_webhook_secret|example/i.test(value);
const results = [];
const add = (label, ok, note) => results.push({ label, ok, note });

add('.env.local exists', fs.existsSync(envPath), fs.existsSync(envPath) ? 'present' : 'missing — run npm run setup:local');
add('SESSION_SECRET', Boolean(env.SESSION_SECRET && env.SESSION_SECRET.length >= 32 && !placeholder(env.SESSION_SECRET)), 'present/valid-length check only; value never printed');
add('API-key encryption key', Boolean(env.LOCAL_API_KEY_ENCRYPTION_KEY && Buffer.from(env.LOCAL_API_KEY_ENCRYPTION_KEY, 'base64url').length === 32), '32-byte local encryption key check only; value never printed');

let appUrlOk = false;
if (env.APP_BASE_URL && !placeholder(env.APP_BASE_URL)) {
  try {
    const url = new URL(env.APP_BASE_URL);
    appUrlOk = !url.username && !url.password && !url.search && !url.hash && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)));
  } catch {}
}
add('APP_BASE_URL', appUrlOk, appUrlOk ? 'valid URL' : 'set a plain URL like http://localhost:3010 (no Markdown brackets)');

const stripeKeyOk = Boolean(env.STRIPE_SECRET_KEY?.startsWith('sk_test_') && !placeholder(env.STRIPE_SECRET_KEY));
const webhookOk = Boolean(env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') && !placeholder(env.STRIPE_WEBHOOK_SECRET));
add('Stripe test secret key', stripeKeyOk, stripeKeyOk ? 'test-key prefix detected; value never printed' : 'not configured — Stripe checkout stays disabled');
add('Stripe webhook secret', webhookOk, webhookOk ? 'signing-secret prefix detected; value never printed' : 'not configured — Stripe webhook crediting stays disabled');
if (stripeKeyOk !== webhookOk) add('Stripe configuration pair', false, 'only one value is configured; configure both to test checkout');

const configuredDb = env.DATABASE_PATH;
const dbPath = configuredDb ? (path.isAbsolute(configuredDb) ? configuredDb : path.resolve(root, configuredDb)) : path.join(root, 'data', 'pay-per-call-agent.db');
if (fs.existsSync(dbPath)) {
  try {
    const require = createRequire(import.meta.url);
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    const needed = ['users', 'services', 'usage_ledger', 'test_wallets', 'stripe_test_checkouts'];
    const missing = needed.filter((name) => !tables.has(name));
    const userCount = tables.has('users') ? db.prepare('SELECT COUNT(*) AS n FROM users').get().n : 0;
    db.close();
    add('SQLite database', missing.length === 0, missing.length ? `missing tables: ${missing.join(', ')}` : `ready; ${userCount} account records; path not printed`);
  } catch {
    add('SQLite database', false, 'could not open/read the local database; run npm run setup:local and retry');
  }
} else {
  add('SQLite database', false, 'not found; run npm run setup:local');
}

console.log('\nPay Per Call Agent — local readiness check\n');
for (const item of results) console.log(`${item.ok ? 'PASS' : 'CHECK'}  ${item.label}: ${item.note}`);
console.log('\nNo secret values were displayed. Missing Stripe settings do not affect local-demo mode.');
const fatal = results.some((item) => item.label === '.env.local exists' && !item.ok) || results.some((item) => ['SQLite database', 'SESSION_SECRET', 'API-key encryption key'].includes(item.label) && !item.ok);
process.exitCode = fatal ? 1 : 0;

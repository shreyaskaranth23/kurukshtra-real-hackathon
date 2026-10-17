# Pay Per Call Agent

A Next.js prototype for a usage-based API/agent marketplace with separate Buyer and Server Host workspaces.

## What's included

- Buyer and Server Host dashboards with local demo accounts
- Service discovery and host-managed service listings
- Agent run/request history and demo call activity
- Encrypted storage for host API credentials
- SQLite usage ledger and sandbox payment balances
- Optional Stripe Checkout for test mode only
- Application health endpoint and configuration preflight check

> **Prototype status:** This is a local development/demo project, not a production payment service. Local test balances are not real money, are not redeemable, and cannot be paid out to Hosts. No production Host payout or real USDC transfer is implemented. Do not configure live Stripe keys.

## Requirements

- Node.js 20 or later recommended
- npm

## Run locally

In Terminal, from the project folder:

```bash
npm install
cp .env.example .env.local
npm run setup:local
npm run preflight
npm run dev
```

`npm run setup:local` generates local `SESSION_SECRET` and `LOCAL_API_KEY_ENCRYPTION_KEY` values if they are missing or invalid and initializes the local SQLite database. Do not share or commit `.env.local`.

Open the local URL printed by the development launcher. It can select a different port if the default port is already in use.

### Local demo accounts

- **Buyer:** `buyer@demo.com` / `BuyerDemo123!`
- **Server Host:** `host@demo.com` / `HostDemo123!`

These accounts are only for local demonstrations. The setup script may reset their passwords. Do not reuse these credentials for real accounts.

## Optional Stripe Checkout (test mode only)

Checkout is disabled until valid Stripe **test-mode** settings are configured in `.env.local`:

- `APP_BASE_URL` — the exact local app URL and port
- `STRIPE_SECRET_KEY` — your own Stripe test-mode secret (`sk_test_...`)
- `STRIPE_WEBHOOK_SECRET` — the matching Stripe CLI webhook signing secret (`whsec_...`)

Use the Stripe CLI for the local webhook listener. Keep both secrets private, never commit them, and never use live keys with this project. `npm run preflight` checks whether the settings appear configured without printing their values.

`GET /api/health` exposes a secret-free app/database status response.

## GitHub safety

The included `.gitignore` excludes `.env.local`, other local environment files, local database files, `node_modules`, build outputs, and logs. Review `git status` before pushing, and never commit real credentials or your local database.

If a secret was exposed or pushed, rotate it; deleting the file in a later commit does not remove it from Git history.

## Before production use

Before accepting public users or real payments, complete a security review, managed persistent storage with migrations/backups, robust authentication and authorization, rate limiting, outbound API egress controls, monitoring/audit logs, payment idempotency/refund/reconciliation handling, provider eligibility review, privacy/legal documentation, and deployment with TLS. Keep this project in test mode until those items have been independently reviewed.

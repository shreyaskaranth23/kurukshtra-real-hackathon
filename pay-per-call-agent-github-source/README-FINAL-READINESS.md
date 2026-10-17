# One-pass local release update — Pay Per Call Agent

This update consolidates the existing local prototype's launch workflow and adds a preflight command plus a health endpoint. It does not turn the prototype into a production payment service.

## Apply to your existing project

1. Stop a running Next.js server only if you actually want to restart it (Control+C in that server's Terminal). Keep the `data/` folder and `.env.local` file.
2. Extract this update into the existing `pay-per-call-agent-local-demo` folder, allowing files to be overwritten. This archive intentionally does **not** include `.env.local`, `data/`, or `node_modules/`.
3. From Terminal:

```bash
cd ~/Downloads/pay-per-call-agent-local-demo
npm run setup:local
npm run preflight
npm run dev
```

The development launcher first checks whether this app is already running (prevents repeated `EADDRINUSE` confusion). If it finds a running app, open the URL it prints instead of starting another server. Otherwise, it picks an available port and prints the matching Stripe CLI command.

## Useful checks

- `GET /api/health` shows app/database status and whether test Checkout settings appear configured; it never returns secret values.
- `npm run preflight` checks `.env.local`, session/encryption key format, SQLite tables and Stripe test-mode configuration without printing credentials.
- For test Checkout only, both `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET=whsec_...` must be real values from your own authorized Stripe test/sandbox and Stripe CLI listener. Don't leave placeholders. Save them in TextEdit inside `.env.local`, not at the Terminal prompt.
- The actual webhook signing secret should never be posted in chats or committed. If it has been exposed, stop the listener and follow Stripe CLI guidance to regenerate/reconfigure it. Keep this local secret out of production configuration.

## Verified boundaries and remaining production work

This code remains a local prototype. The database is SQLite on the local disk; it isn't appropriate for serverless multi-instance production. Stripe code in this branch is test-mode only. Local wallet credits are non-redeemable and no Host payout or real USDC transfer is implemented. The demo setup script resets the two demo account passwords on each development startup.

Before accepting public users/payments, the owner must configure a managed production database (and migrations/backups), verified authentication and recovery, a tested production deployment, centralized rate limiting, outbound API egress controls, monitoring/audit logs, refund/chargeback/reconciliation paths, merchant eligibility and payment-provider approval, privacy/legal documentation, and a security review. Do not use live Stripe keys with this project or treat the sandbox ledger as real accounting.

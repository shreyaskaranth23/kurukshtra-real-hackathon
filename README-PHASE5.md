# Phase 5 — Persistent usage meter and ledger

This patch adds a persistent, per-run usage snapshot for each successfully completed agent run. It does not charge a Buyer, issue an invoice, move funds, or create payable Host earnings.

## Apply

1. Stop the running Next.js server with `Control + C`.
2. Download `pay-per-call-agent-phase5-usage-ledger-patch.zip` into `~/Downloads`.
3. Run:

```bash
cd ~/Downloads/pay-per-call-agent-local-demo
BACKUP="$HOME/Downloads/pay-per-call-agent-backup-phase5-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -R app lib scripts "$BACKUP"/
unzip -o ~/Downloads/pay-per-call-agent-phase5-usage-ledger-patch.zip -d .
npm run dev
```

Use the local URL printed in Terminal. No `npm install` is needed because no dependencies changed.

## What it adds

- A SQLite `usage_ledger` table with unique run references and a price snapshot at time of run.
- Backfill of prior successfully completed local and live API runs. Existing users, services, run history, `.env.local`, and API credential encryption configuration are preserved.
- Buyer/Host summaries for total recorded runs, monthly estimate, live API run count, and recent ledger entries.
- Run ledger rows are inserted transactionally with the run record; uniqueness on `call_id` prevents duplicate ledger rows for one run.

## Important limitations

The amounts are the listing's price snapshot, not verified payment amounts. `settlement_status` is constrained to `not-billed`; this patch does not integrate payment processing, invoices, refunds, payouts, a production database, or production-grade distributed concurrency. This local SQLite database remains appropriate for development/demo use only.

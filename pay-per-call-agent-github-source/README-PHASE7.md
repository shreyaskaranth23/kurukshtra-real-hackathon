# Phase 7 — Payment Sandbox and Test Transactions

This patch adds a local-only payment sandbox to the existing Pay Per Call Agent demo.

## What it adds

- Buyer sandbox wallet with a **10 test USDC** credit action and a **100 test USDC lifetime funding cap per Buyer account**.
- A simulated checkout for a previously successful agent run.
- Atomic local balance updates: Buyer test balance decreases, Host test balance increases, and matching debit/credit rows are written.
- One sandbox settlement per successful run, enforced by a unique database constraint and an idempotency key.
- Separate Buyer/Host transaction histories and test-wallet summaries.
- SQLite schema migration that keeps the existing local database, login accounts, agent listings, usage history and API configuration.

## Apply the patch

1. Download `pay-per-call-agent-phase7-payment-sandbox.zip` to your Mac's Downloads folder.
2. Stop the running dev server with **Control + C**.
3. Run the following in Terminal:

```bash
cd ~/Downloads/pay-per-call-agent-local-demo || exit 1
BACKUP="$HOME/Downloads/pay-per-call-agent-backup-phase7-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -R app lib scripts "$BACKUP"/
unzip -o ~/Downloads/pay-per-call-agent-phase7-payment-sandbox.zip -d .
npm run dev
```

The patch adds no npm dependency. Keep `.env.local` and `data/` in place; they contain your local secrets and database.

## Test it

1. Open the local URL displayed by Terminal.
2. Sign in as `buyer@demo.com` with password `BuyerDemo123!`.
3. In the Buyer dashboard, click **Add 10 test USDC**. This creates local demo credits only.
4. Run a service in the marketplace so a successful run appears in **Successful runs available for test checkout**.
5. Click **Pay in sandbox** beside that run. The app simulates a debit from the Buyer test balance and an equal credit to the Host test balance.
6. Sign in as `host@demo.com` with password `HostDemo123!` and inspect **Sandbox receipts**.
7. Try clicking a settled run again or refreshing; the app must not charge it twice.

## Safety boundaries

- This is **not real USDC** and is not on Base Sepolia or any blockchain.
- The project does not connect a wallet, request a signature, use a payment processor, send tokens, issue a redeemable balance, or execute Host payouts.
- Existing usage-ledger rows remain labelled `not-billed`; the sandbox transaction ledger is separate and explicitly labelled local-only.
- The 10-credit funding action is capped to 100 test USDC over the life of a Buyer account. These limits are for demo safety, not a production fraud-control system.
- Do not treat the local sandbox as production accounting. Before actual payments, implement a vetted payment protocol, chain/contract validation, server-authoritative price verification, reconciliation, refunds/disputes, and security review.

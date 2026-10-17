# Phase 8 — Stripe TEST-mode Checkout and verified webhook crediting

This is a test-mode integration for the existing local prototype. It intentionally rejects live Stripe secret keys and ignores live-mode webhook events. It does not move real money, create redeemable USDC, or send Host payouts.

## What it adds

- Hosted Stripe Checkout sessions for fixed test top-ups of $5, $10, or $25.
- Server-side-only `sk_test_` key use; the key is never exposed to the browser.
- Signed webhook verification using the raw request body, timestamp tolerance, and constant-time signature comparison.
- Idempotent SQLite credit fulfillment: a completed test Checkout session may credit the local test wallet only once.
- Fixed server-calculated amounts and credit conversion; the client cannot request an arbitrary price.
- Session expiry handling, pending checkout reservations, a 100-test-credit lifetime cap, and local ledger receipts.
- The old local faucet and Phase 7 simulated call-settlement flow remain available.

## Apply the patch on macOS

1. Download `pay-per-call-agent-phase8-stripe-test-checkout.zip` into `~/Downloads`.
2. Stop the current Next.js server with **Control + C**.
3. In Terminal, run:

```bash
cd ~/Downloads/pay-per-call-agent-local-demo || exit 1
BACKUP="$HOME/Downloads/pay-per-call-agent-backup-phase8-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -R app lib scripts "$BACKUP"/
unzip -o ~/Downloads/pay-per-call-agent-phase8-stripe-test-checkout.zip -d . || exit 1
npm run dev
```

No additional npm dependency is used. Keep `data/` and `.env.local` intact.

## Configure TEST MODE only

1. Use a Stripe test/sandbox workspace with permission from its account owner. If account access or eligibility requires an adult, have a parent/guardian or teacher manage that workspace. Do not bypass identity or age requirements.
2. In the Stripe dashboard's test mode, copy the **test secret key** whose prefix is `sk_test_`. Never use or paste a live key (`sk_live_`) into this demo.
3. Set `APP_BASE_URL` in `.env.local` to the exact local URL displayed by Next.js, for example `http://localhost:3009`. Use your actual port.
4. Set `STRIPE_SECRET_KEY=sk_test_...` in `.env.local`. Never prefix it with `NEXT_PUBLIC_`, commit it, or share it in chat.
5. Install Stripe CLI on macOS if it's not already available, using the official documentation. Open a **second Terminal window**, authenticate the CLI in the test workspace, then forward events to the same Next.js port:

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:3009/api/webhooks/stripe
```

Change `3009` to the actual port from Next.js. Keep `stripe listen` running. It prints a signing secret that begins with `whsec_`; copy that into `STRIPE_WEBHOOK_SECRET` in `.env.local`. This value is different from the API key. Restart `npm run dev` after editing `.env.local`, and keep the CLI running in its second Terminal window.

Official references:
- Stripe Checkout and webhook-based fulfillment: https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted
- Stripe CLI installation and login: https://docs.stripe.com/development/quickstart
- Stripe test cards: https://docs.stripe.com/testing

## Test flow

1. Sign in as `buyer@demo.com` / `BuyerDemo123!`.
2. In **Test wallet & checkout**, choose `Pay $5 test` (or $10 / $25).
3. On Stripe's hosted test Checkout page, use a Stripe test card such as `4242 4242 4242 4242`, a future expiry date such as `12/34`, and any three-digit CVC. These are test values only; do not enter a real card.
4. After redirecting back, the page says that crediting depends on the signed webhook. Click **Refresh sandbox ledger** if the webhook arrives a moment later.
5. Confirm the wallet and transaction history show test credits. The underlying local wallet uses internal TEST USDC-equivalent units; the Stripe test charge itself is denominated in USD. No conversion to real USDC happens.
6. Try cancelling a Checkout or replaying an event. A cancelled/expired Checkout must not add credits, and replaying a completed event must not add credits twice.

## Important boundaries

- Checkout only accepts a server-side test key beginning `sk_test_`; live-mode webhook events are ignored.
- The `success_url` is only a browser redirect. It does not credit the wallet. Only a valid signed webhook can fulfill a test Checkout.
- Test-mode Stripe payments simulate transactions without moving money. These local credits are not redeemable, withdrawable, transferable outside the app, or actual USDC.
- This isn't ready for production or actual payments. A real deployment needs provider/platform policy review, age/merchant eligibility, verified domains, TLS, persistent managed database, distributed idempotency, refund/chargeback handling, accounting reconciliation, rate limiting, secret rotation, audit logs and a security review. Do not switch to live keys.

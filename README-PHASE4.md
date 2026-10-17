# Phase 4 — Live API Integration (local prototype)

This patch adds opt-in server-side JSON API calls to the existing local Pay Per Call Agent demo.

## Apply this patch

1. Stop the current dev server with `Control + C`.
2. Download `pay-per-call-agent-phase4-real-api-patch.zip` into Downloads.
3. In Terminal:

```bash
cd ~/Downloads/pay-per-call-agent-local-demo
BACKUP="$HOME/Downloads/pay-per-call-agent-backup-phase4-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -R app lib scripts "$BACKUP"/
unzip -o ~/Downloads/pay-per-call-agent-phase4-real-api-patch.zip -d .
npm run dev
```

The setup script creates and preserves `LOCAL_API_KEY_ENCRYPTION_KEY` inside `.env.local`, and migrates existing SQLite databases without removing user/service/run data. Do not delete `.env.local` or the `data` folder; the encryption key is needed to decrypt saved host API keys.

## Smoke test with a safe echo API

1. Sign in as Server Host: `host@demo.com` / `HostDemo123!`.
2. In **My Services**, edit the seeded **Demo Text Summarizer** listing.
3. Set Endpoint URL to `https://postman-echo.com/post`.
4. Expand **Real API connection**. Leave API authentication as `Authorization: Bearer token` and leave API key blank for this public echo endpoint.
5. Tick **Enable live API execution**, then save the listing.
6. Log out, sign in as Buyer (`buyer@demo.com` / `BuyerDemo123!`), refresh the marketplace, and run the agent with non-sensitive sample text.
7. The output should contain the JSON response from the echo service. History labels successful external calls `API CALLED · NO PAYMENT`.

The echo test sends the JSON you enter to a third-party service. Use only dummy, non-sensitive input.

## Supported endpoint contract

- Public DNS hostname with HTTPS, no URL credentials or fragments.
- Server sends `POST` with `Content-Type: application/json` and the buyer's JSON body.
- Endpoint must return a successful status and a JSON object within 64 KB, within 10 seconds.
- Optional host API key supports `Authorization: Bearer <key>` or `x-api-key: <key>`.
- Redirects are blocked. Private/local/reserved IP addresses are rejected. Obvious auth/API-key fields and exact configured key values are redacted from saved outputs.
- API key is encrypted at rest using AES-256-GCM and `LOCAL_API_KEY_ENCRYPTION_KEY`; the key is never sent to the browser after saving.
- The configured hourly limit is checked for successful live API runs. The existing concurrency setting is not yet enforced.

## Boundaries

Live API calls may consume the host's third-party quota. This feature **does not** charge Buyers, settle USDC, create real Host earnings, or implement x402. Listed prices remain informational. This is still a local prototype, not production-ready for untrusted public deployment; robust production egress controls (including DNS-pinning against rebinding), abuse controls, schema validation, and a persistent production database remain needed before public hosting.

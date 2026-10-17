# Phase 6 — Authentication and API Security Hardening

This patch hardens the existing local Pay Per Call Agent prototype. It does not add payment processing or make the app production-ready on its own.

## What this patch changes

- Adds persistent SQLite rate limits for sign-in and sign-up attempts. Sign-in is limited per email and request IP; sign-up has stricter limits.
- Rejects state-changing browser API requests when the Origin/Referer does not match the request origin.
- Limits login/register bodies to 16 KiB and requires JSON content type.
- Restricts session JWT verification to HS256 and verifies the configured issuer and audience.
- Adds anti-framing, MIME-sniffing, referrer, permissions and opener security headers, plus HSTS in production mode.
- Keeps password hashing, HTTP-only cookies, database-backed role lookup and existing owner/role checks.

## Apply on macOS

1. Stop the existing Next.js server with **Control + C**.
2. Download `pay-per-call-agent-phase6-auth-hardening.zip` to `~/Downloads`.
3. Run this block in Terminal:

```bash
cd ~/Downloads/pay-per-call-agent-local-demo || exit 1

PATCH="$HOME/Downloads/pay-per-call-agent-phase6-auth-hardening.zip"
if [ ! -f "$PATCH" ]; then
  echo "Patch ZIP not found in Downloads. Download it first."
  exit 1
fi

BACKUP="$HOME/Downloads/pay-per-call-agent-backup-phase6-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -R app lib "$BACKUP"/
cp next.config.ts "$BACKUP"/

unzip -o "$PATCH" -d . || exit 1
npm run dev
```

Open the exact local URL printed by Next.js. No `npm install` is required because dependencies are unchanged. Your `data/` directory and `.env.local` are not in the patch and should be kept.

## Re-test

- Buyer demo account: `buyer@demo.com` / `BuyerDemo123!`
- Server Host demo account: `host@demo.com` / `HostDemo123!`
- Sign in again after applying the patch: session tokens minted before this change do not include the stricter issuer/audience claims.
- Exercise existing Buyer and Host flows. A successful sign-in should open the same role's workspace as before.
- If you make too many attempts, the API returns `429` with `Retry-After`; wait for the indicated time rather than repeatedly retrying.

## Important production caveats

This remains a local single-machine prototype. SQLite rate limits are not shared across multiple application instances; an actual deployment should use a centralized rate limiter/store and a trusted proxy that overwrites forwarding headers. Before deployment, also configure HTTPS, secret rotation, persistent managed storage/backups, monitoring, account recovery, email verification or another account-proofing flow, and a security review. Demo credentials must never be enabled on a public deployment. Do not accept real payments or production API secrets until that review is complete.

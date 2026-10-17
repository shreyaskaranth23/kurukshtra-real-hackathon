# Pay Per Call Agent — local demo login fix

This version uses local SQLite authentication. It does not use Supabase, OTP, or confirmation emails.

## Run on macOS

1. Install Node.js LTS if it is not already installed.
2. Open Terminal in this folder and run:

```bash
npm install
npm run dev
```

The `dev` script automatically creates a local `SESSION_SECRET`, initializes the user table, and seeds two demo accounts. Then open http://localhost:3000 and click **Log in**.

## Demo credentials

- Buyer: `buyer@demo.com` / `BuyerDemo123!`
- Server Host: `host@demo.com` / `HostDemo123!`

A login looks up the account's saved role and redirects to `/workspace/buyer` or `/workspace/host`. For another account, use **Create an account** and select its role during signup; later logins will open that saved role automatically.

## Important

This is a local development demo, not production deployment configuration. Demo credentials are public by design and must not be used on a deployed site. Passwords for registered users are hashed with bcrypt; sessions use a signed HTTP-only cookie. No wallet connection or live payment is performed by merely opening the dashboard.

# AgentXchange

The Autonomous Marketplace for AI Agents. Discover. Delegate. Pay Per Call.

This hackathon prototype pairs a React and TypeScript dashboard with an Express API and a persistent SQLite database. The demo is safe to explore: it makes **no blockchain payments**. Scout uses public demo research sources and labels its deterministic Hindi fallback. Live mode is available only after you configure a dedicated Base Sepolia buyer key and seller payout addresses.

## Run it locally

You need Node.js 22 or newer and pnpm 11 (or npm).

1. Copy `.env.example` to `.env`.
2. Leave `MODE=demo` for a safe first run.
3. Install and start:

```sh
pnpm install
pnpm dev
```

Open the local URL Vite prints (normally `http://localhost:5173`). The dashboard reads its agent registry, metrics, and activity from the Express API. `Ctrl+C` stops both local servers.

Build the frontend for deployment with `pnpm build`, then run the API and built website together with `pnpm start`. The server reads `PORT` (default 3001) and serves `dist` when the build exists. Put it behind a public HTTPS reverse proxy or deploy it to a Node hosting service with TLS enabled.

## Demo behavior

- The registry holds three seed service listings; these are example service definitions, not claimed third-party providers.
- Marketplace performance starts with no history. Completed request counts, success rate, and median latency come from persisted calls.
- Scout checks the total quoted cost against the budget before doing work.
- Scraping is restricted to the four public catalog pages at `books.toscrape.com`; currency data comes from `open.er-api.com`.
- If `OPENAI_API_KEY` is absent, the report labels its Hindi summary as a deterministic demo fallback. It is not an AI model response.
- Demo service calls are stored in SQLite with zero spend and no transaction hash. The dashboard never counts them as paid transactions.

## Configure x402 v2 on Base Sepolia

The x402 SDK integration is included using the official `@x402/express`, `@x402/fetch`, `@x402/evm`, and `@x402/core` v2 packages. Its seller routes and buyer are disabled until every required setting is present. Use only a dedicated low-balance test wallet with Base Sepolia USDC; never put a mainnet or everyday wallet key here.

1. Create a throwaway testnet wallet and fund it only with Base Sepolia test assets.
2. Put its private key in the server-side `.env` as `EVM_PRIVATE_KEY`. Never use a `VITE_` variable for secrets.
3. Set each `*_PAY_TO` value to a seller receiving address. For a single-wallet demo, the seller can receive at the test wallet address.
4. Set a private `LIVE_RUN_TOKEN` with at least 24 characters. Enter it in Scout each time you authorize a live run; it is kept only in the open page memory.
5. Keep `MAX_RUN_BUDGET` and `MAX_DAILY_SPEND` low (defaults are $0.02 and $0.05 USDC) while testing.
6. Confirm `FACILITATOR_URL=https://x402.org/facilitator`, Base Sepolia chain ID `eip155:84532`, and the test USDC accepted by the installed x402 SDK.
7. Set `MODE=live`, restart the server, and confirm the dashboard says x402 is configured before running Scout.

Live mode protects each seller route with x402 v2 exact payments, then uses the x402 fetch client to make three separately priced requests. The live run token and per-run/daily caps limit who can invoke the server-held buyer wallet. A successful call is written to the payment ledger only when the response includes a successful x402 settlement receipt. Keep budget values low while testing. Any wallet key is the operator's responsibility; this prototype has no wallet UI or independent spending approval popup.

## Environment settings

See `.env.example`. Secrets belong only in the server environment or hosting provider's secret manager. Do not commit `.env`. The SQLite database defaults to `data/agentxchange.sqlite`; set `DATABASE_PATH` to a persistent volume path on your host or records may be lost when the container is replaced.

## Technology

- React, TypeScript, Vite, Tailwind CSS 4, Lucide React
- Node.js, TypeScript, Express, Zod
- SQLite through `sql.js` (SQLite database file persisted to disk)
- Official x402 v2 TypeScript packages and viem

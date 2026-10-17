# Pay Per Call Agent — Phase 2 local demo activity

This patch adds a local simulated buyer request flow and host activity counters.

## What works
- Buyer and Server Host local login via the existing SQLite account system.
- Host can publish/edit/pause/delete service listings.
- Buyer can search active listings and record a simulated demo request.
- Buyer sees demo request count, simulated spend, and recent activity.
- Host sees demo request count, simulated earnings value, and recent activity.
- A sample `Demo Text Summarizer` listing is added only when the demo host has no listings.

## Safety / limitations
- Demo request records are local-only simulations. They do not invoke a listed endpoint, connect a wallet, send USDC, or create real earnings.
- The demo credentials are public and are for local development only. Do not deploy this configuration publicly.
- The service registry and simulation are not a production x402 payment runtime.

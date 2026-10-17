# Pay Per Call Agent — Phase 3 local agent runner

This patch adds a structured JSON input/output playground on top of the Phase 2 local demo.

## What works
- Buyers can open a listing's Run Agent panel and edit JSON input.
- Input is checked against saved required fields and basic JSON Schema property types.
- Runs create a local activity record with submitted input, generated demo output, duration, service and role details.
- The buyer and the service host can both view recent input/output logs.
- A deterministic local runner creates demonstration output for summary, keyword, data, and scraping-like examples.
- New run details are stored in SQLite and the table is created automatically for existing local databases.

## Important limitations
- This is still a local sandbox. It never contacts the listing's `endpointUrl`, even when configured.
- It does not connect a wallet, send USDC, use x402 settlement, or generate real earnings.
- Do not deploy with the public demo accounts. Before real external endpoint invocation, add SSRF defenses, host endpoint/domain ownership checks, secret management, timeouts/response limits, abuse controls, and payment verification.

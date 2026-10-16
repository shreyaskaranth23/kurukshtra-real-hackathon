
import express from "express";
import "dotenv/config";

import { paymentMiddleware } from "@x402/express";
import {
  x402ResourceServer,
  HTTPFacilitatorClient,
} from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

const app = express();
const PORT = process.env.PORT || 3001;
const payTo = process.env.SELLER_ADDRESS;

if (!payTo || !/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
  throw new Error(
    "SELLER_ADDRESS is missing or is not a valid EVM address in .env"
  );
}

app.use(express.json());

const facilitator = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

const server = new x402ResourceServer(facilitator);

registerExactEvmScheme(server);

// Health check — no payment required.
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "web-scraper-agent",
    network: "eip155:84532",
  });
});

// Require x402 payment before accessing this endpoint.
app.use(
  paymentMiddleware(
    {
      "POST /scrape": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "eip155:84532",
            payTo,
          },
        ],
        description: "Paid webpage scraping service",
        mimeType: "application/json",
      },
    },
    server
  )
);

// Temporary demo response — actual scraping comes later.
app.post("/scrape", (req, res) => {
  const { url } = req.body ?? {};

  if (typeof url !== "string" || !url.startsWith("https://")) {
    return res.status(400).json({
      error: "Please provide a valid HTTPS URL.",
    });
  }

  res.json({
    service: "web-scraper-agent",
    url,
    result: "Paid endpoint reached successfully.",
  });
});

app.listen(PORT, () => {
  console.log(`Seller agent running at http://localhost:${PORT}`);
  console.log("Payment network: Base Sepolia");
  console.log("Price: 0.001 testnet USDC per request");
});

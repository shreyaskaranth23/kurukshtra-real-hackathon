
import express from "express";
import "dotenv/config";
import * as cheerio from "cheerio";
import { isIP } from "node:net";
import { agents } from "./registry.js";
import { scrapeWithPayment } from "./buyer.js";
import { paymentMiddleware } from "@x402/express";
import { extractStructuredData } from "./extractor.js";
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

app.use(express.json({ limit: "10kb" }));

const facilitator = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

const server = new x402ResourceServer(facilitator);
registerExactEvmScheme(server);

// Reject obvious local/private destinations.
function validateUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Please provide a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed.");
  }

  if (
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.hostname === "localhost" ||
    parsed.hostname.endsWith(".localhost") ||
    parsed.hostname.endsWith(".local") ||
    parsed.hostname === "[::1]" ||
    parsed.hostname === "0.0.0.0"
  ) {
    throw new Error("This destination is not allowed.");
  }

  // Reject literal IP addresses for this MVP.
  // A production scraper should also resolve DNS and block
  // private/reserved IPs, including after every redirect.
  if (isIP(parsed.hostname.replace(/^\[|\]$/g, ""))) {
    throw new Error("IP-address URLs are not allowed.");
  }

  return parsed;
}

// Health check — no payment required.
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "web-scraper-agent",
    network: "eip155:84532",
  });
});

 // Public service discovery — no payment required.
app.get("/registry", (req, res) => {
  res.json({
    agents: agents.map(({ payToEnv, ...agent }) => ({
      ...agent,
      payTo: process.env[payToEnv] ?? null
    }))
  });
});


app.post("/api/scrape", async (req, res) => {
  const { url } = req.body ?? {};

  if (typeof url !== "string" || url.length > 2048) {
    return res.status(400).json({
      error: "Provide a valid URL shorter than 2048 characters.",
    });
  }

  try {
    const { result, paymentResponse } =
      await scrapeWithPayment(url);

    return res.json({
      status: "success",
      result,
      payment: {
        responseHeader: paymentResponse,
      },
    });
  } catch (error) {
    console.error("Buyer request failed:", error.message);

    return res.status(502).json({
      status: "error",
      error: error.message || "The paid scraping request failed.",
    });
  }
});


// Payment required before the scraper runs.
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

app.post("/scrape", async (req, res) => {
  try {
    const { url } = req.body ?? {};

    if (typeof url !== "string" || url.length > 2048) {
      return res.status(400).json({
        error: "Provide a URL shorter than 2048 characters.",
      });
    }

    const parsedUrl = validateUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;

    try {
      response = await fetch(parsedUrl, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "User-Agent": "AgentEconomyScraper/1.0",
          Accept: "text/html",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return res.status(502).json({
        error: `Target webpage returned HTTP ${response.status}.`,
      });
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      return res.status(415).json({
        error: "The target URL did not return HTML.",
      });
    }

    const html = await response.text();

    if (Buffer.byteLength(html, "utf8") > 2_000_000) {
      return res.status(413).json({
        error: "Target webpage is too large to process.",
      });
    }

    const $ = cheerio.load(html);

    $("script, style, noscript, iframe, svg").remove();

    const title = $("title").first().text().trim();
    const description =
      $('meta[name="description"]').attr("content")?.trim() || "";

    const headings = $("h1, h2")
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean)
      .slice(0, 20);

    const text = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10000);

    const links = $("a[href]")
      .map((_, element) => {
        const href = $(element).attr("href");
        const label = $(element).text().trim();

        try {
          const absoluteUrl = new URL(href, parsedUrl).href;

          if (
            new URL(absoluteUrl).protocol === "https:" &&
            label
          ) {
            return { label: label.slice(0, 200), url: absoluteUrl };
          }
        } catch {
          // Skip malformed links.
        }

        return null;
      })
      .get()
      .filter(Boolean)
      .slice(0, 20);

    return res.json({
      service: "web-scraper-agent",
      url: parsedUrl.href,
      title,
      description,
      headings,
      text,
      links,
      scrapedAt: new Date().toISOString(),
    });
  } catch (error) {
    const timedOut = error.name === "AbortError";

    return res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "The target webpage timed out."
        : error.message || "Scraping failed.",
    });
  }
});


app.post("/api/extract", async (req, res) => {
  const { data } = req.body ?? {};

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({
      status: "error",
      error: "Provide scraped webpage data as an object in the 'data' field.",
    });
  }

  try {
    const result = extractStructuredData(data);

    return res.json({
      status: "success",
      result,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      error: error.message || "Extraction failed.",
    });
  }
});


app.post("/api/scrape-and-extract", async (req, res) => {
  const { url } = req.body ?? {};

  if (typeof url !== "string" || url.length > 2048) {
    return res.status(400).json({
      status: "error",
      error: "Provide a valid URL shorter than 2048 characters.",
    });
  }

  try {
    const { result: scraped } = await scrapeWithPayment(url);
    const extracted = extractStructuredData(scraped);

    return res.json({
      status: "success",
      scraped,
      extracted,
    });
  } catch (error) {
    console.error("Scrape-and-extract failed:", error.message);

    return res.status(502).json({
      status: "error",
      error: error.message || "Scraping and extraction failed.",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Seller agent listening on port ${PORT}`);
  console.log("Payment network: Base Sepolia");
});

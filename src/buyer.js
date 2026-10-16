import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";

const SELLER_URL = "http://localhost:3001/scrape";
const NETWORK = "eip155:84532";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const MAX_AMOUNT = "1000"; // 0.001 USDC

const buyerKey = process.env.BUYER_PRIVATE_KEY;
const sellerAddress = process.env.SELLER_ADDRESS;

if (!buyerKey || !/^0x[a-fA-F0-9]{64}$/.test(buyerKey)) {
  throw new Error("BUYER_PRIVATE_KEY is missing or invalid.");
}

if (!sellerAddress || !/^0x[a-fA-F0-9]{40}$/.test(sellerAddress)) {
  throw new Error("SELLER_ADDRESS is missing or invalid.");
}

const buyer = privateKeyToAccount(buyerKey);

if (buyer.address.toLowerCase() === sellerAddress.toLowerCase()) {
  throw new Error("Buyer and seller must use separate wallets.");
}

function validateChallenge(response) {
  const encoded = response.headers.get("PAYMENT-REQUIRED");

  if (!encoded) {
    throw new Error("402 response is missing PAYMENT-REQUIRED.");
  }

  let challenge;

  try {
    challenge = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8")
    );
  } catch {
    throw new Error("Invalid PAYMENT-REQUIRED challenge.");
  }

  if (
    challenge.x402Version !== 2 ||
    !Array.isArray(challenge.accepts)
  ) {
    throw new Error("Unsupported or invalid x402 challenge.");
  }

  const match = challenge.accepts.find((payment) =>
    payment.scheme === "exact" &&
    payment.network === NETWORK &&
    payment.amount === MAX_AMOUNT &&
    payment.asset?.toLowerCase() === USDC.toLowerCase() &&
    payment.payTo?.toLowerCase() === sellerAddress.toLowerCase()
  );

  if (!match) {
    throw new Error("Payment terms mismatch. Payment refused.");
  }

  return match;
}

// Validate payment requirements before the SDK creates a payment.

const guardedFetch = async (input, init) => {
  const response = await fetch(input, init);

  const requestHeaders = new Headers(
    init?.headers ??
      (input instanceof Request ? input.headers : undefined)
  );

  const isPaymentRetry = requestHeaders.has("PAYMENT-SIGNATURE");

  console.log("[Buyer debug] URL:", input);
  console.log("[Buyer debug] Status:", response.status);
  console.log("[Buyer debug] Payment retry:", isPaymentRetry);
  console.log(
    "[Buyer debug] PAYMENT-REQUIRED present:",
    response.headers.has("PAYMENT-REQUIRED")
  );

  // Validate the original challenge before signing.
  // Let the SDK inspect a failed payment retry's response.
  if (response.status === 402 && !isPaymentRetry) {
    validateChallenge(response);
  }

  return response;
};


const client = new x402Client();

registerExactEvmScheme(client, {
  signer: buyer,
  networks: [NETWORK],
});

client.setSpendControls({
  allowedAssets: [
    {
      network: NETWORK,
      asset: USDC,
      maxAmountPerPayment: MAX_AMOUNT,
    },
  ],
});

const paidFetch = wrapFetchWithPayment(guardedFetch, client);
// Reusable function for the backend API.
export async function scrapeWithPayment(url) {
  const response = await paidFetch(SELLER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const body = await response.text();
  let result;

  try {
    result = JSON.parse(body);
  } catch {
    result = { message: body };
  }

  if (!response.ok) {
    throw new Error(
      result.error || `Seller request failed with HTTP ${response.status}.`
    );
  }

  return {
    result,
    paymentResponse: response.headers.get("PAYMENT-RESPONSE"),
  };
}

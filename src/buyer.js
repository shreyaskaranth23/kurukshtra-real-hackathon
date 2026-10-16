import "dotenv/config";
const sellerUrl = "http://localhost:3001/scrape";
const expected = {
    network: "eip155:84532",
    amount: "1000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    payTo: process.env.SELLER_ADDRESS,
};
if (!expected.payTo || !/^0x[a-fA-F0-9]{40}$/.test(expected.payTo)) {
    throw new Error("SELLER_ADDRESS is missing or is not a valid EVM address in .env");
}

//deliberately make an unpaid request to test the payment flow
const response = await fetch(sellerUrl, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({url: "https://example.com"}),
});
if (response.status !== 402) {
    throw new Error(`Expected 402 Payment Required, but got ${response.status}`);
}

const header = response.headers.get("PAYMENT-REQUIRED");

if (!header) {
    throw new Error("Expected x402-payment-request header, but it was missing");
}

let challenge;
try {
    challenge = JSON.parse(
        Buffer.from(header, "base64").toString("utf-8")
    );
} catch {
    throw new Error("Expected x402-payment-request header to be valid base64-encoded JSON, but it was not");
}

if (challenge.x402Version !== 2|| !Array.isArray(challenge.accepts)) {
    throw new Error("Expected x402-payment-request header to be a valid x402 v2 challenge, but it was not");
}

const match = challenge.accepts.find((payment) =>
    payment.scheme === "exact" &&
    payment.network === expected.network &&
    payment.amount === expected.amount &&
    payment.asset?.toLowerCase() === expected.asset.toLowerCase() &&
    payment.payTo?.toLowerCase() === expected.payTo.toLowerCase()
);

if (!match) {
    throw new Error("Payment terms don't match expectations. No Payment made.");
}

console.log("Payment challenge validated. Proceeding to pay the seller...");
console.log("Network:", match.network);
console.log("Amount:0.001 testnet USDC");
console.log("Recipent:", match.payTo);
console.log("Preflight passed. No signature created. No payment sent.");

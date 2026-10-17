"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, BadgeCheck, CircleDollarSign, FlaskConical, RefreshCw, Wallet } from "lucide-react";

type Role = "buyer" | "host";
type PaymentTransaction = {
  id: number;
  reference: string;
  kind: "test-funding" | "agent-call";
  amountUsdc: string;
  serviceName: string;
  otherParty: string;
  callId: number | null;
  createdAt: string;
  status: "simulated-completed";
  network: "LOCAL-SANDBOX";
};
type PaymentData = {
  wallet: {
    balanceUsdc: string;
    totalFundedUsdc: string;
    totalPaidUsdc: string;
    totalReceivedUsdc: string;
    fundingCapReached: boolean;
    fundingCapUsdc: string;
  };
  transactions: PaymentTransaction[];
  paidCallIds: number[];
  sandboxOnly: true;
};
type AgentRun = {
  id: number;
  serviceName: string;
  priceUsdc: string;
  createdAt: string;
  mode: "local-demo" | "live-api-no-payment";
};

async function getError(response: Response) {
  try {
    const body = await response.json() as { error?: string };
    return body.error || `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

export default function TestPaymentsPanel({ role }: { role: Role }) {
  const [data, setData] = useState<PaymentData | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const paymentResponse = await fetch("/api/payments", { cache: "no-store" });
      if (!paymentResponse.ok) throw new Error(await getError(paymentResponse));
      const paymentData = await paymentResponse.json() as PaymentData;
      setData(paymentData);
      if (role === "buyer") {
        const runResponse = await fetch("/api/agent-runs", { cache: "no-store" });
        if (!runResponse.ok) throw new Error(await getError(runResponse));
        const runData = await runResponse.json() as { runs: AgentRun[] };
        setRuns(runData.runs || []);
      }
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load sandbox payments.");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (role !== "buyer" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const stripeState = params.get("stripe");
    if (stripeState === "success") {
      setNotice("Returned from Stripe TEST Checkout. Credits are added only after the signed webhook is verified. Refresh the ledger if the balance has not updated yet.");
      void load();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (stripeState === "cancelled") {
      setNotice("Stripe TEST Checkout was cancelled. No test credits were added.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [role, load]);

  async function startStripeCheckout(amountCents: number) {
    setBusy(`stripe-${amountCents}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/billing/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
      if (!result.url || !result.url.startsWith("https://checkout.stripe.com/")) {
        throw new Error("The server did not return a valid Stripe Checkout URL.");
      }
      window.location.assign(result.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Could not start Stripe test Checkout.");
      setBusy(null);
    }
  }

  async function mutate(action: "fund" | "settle", callId?: number) {
    const busyKey = action === "fund" ? "fund" : `settle-${callId}`;
    setBusy(busyKey);
    setError("");
    setNotice("");
    try {
      const requestId = action === "fund"
        ? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `fund-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`)
        : undefined;
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "fund" ? { action, requestId } : { action, callId }),
      });
      const result = await response.json() as PaymentData & { error?: string; funding?: string; settlement?: string };
      if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
      setData(result);
      setNotice(action === "fund"
        ? "10 test USDC added. This credit has no monetary value."
        : result.settlement === "already-settled-in-sandbox"
          ? "This run was already settled in the local sandbox; it was not charged again."
          : "Sandbox settlement complete. No real funds moved.");
      if (role === "buyer") {
        const runResponse = await fetch("/api/agent-runs", { cache: "no-store" });
        if (runResponse.ok) {
          const runData = await runResponse.json() as { runs: AgentRun[] };
          setRuns(runData.runs || []);
        }
      }
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Sandbox action failed.");
    } finally {
      setBusy(null);
    }
  }

  const wallet = data?.wallet;
  const paid = new Set(data?.paidCallIds ?? []);
  const transactions = data?.transactions ?? [];

  return (
    <section className="workspace-panel workspace-ledger-panel test-payments-panel">
      <div className="workspace-panel-heading">
        <div><span className="workspace-kicker">PHASE 8 · CHECKOUT TESTING</span><h2>{role === "buyer" ? "Test wallet & checkout" : "Sandbox receipts"}</h2></div>
        <span className="test-payment-badge"><FlaskConical size={14} /> LOCAL TEST ONLY</span>
      </div>
      <p className="workspace-panel-description">
        {role === "buyer"
          ? "Add non-redeemable test credits, run an agent, then simulate a payment for a successful run. Duplicate settlement attempts are blocked."
          : "View test credits received from simulated Buyer checkouts. These balances cannot be withdrawn, transferred outside the app, or exchanged for real USDC."}
      </p>

      {loading && !data ? <div className="workspace-empty-state">Loading local test wallet…</div> : null}
      {wallet ? (
        <>
          <div className="test-payment-stats">
            <article><span><Wallet size={15} /> Sandbox balance</span><strong>{wallet.balanceUsdc} USDC</strong><small>Non-redeemable test units</small></article>
            {role === "buyer" ? (
              <article><span><ArrowDownLeft size={15} /> Test credits added</span><strong>{wallet.totalFundedUsdc} USDC</strong><small>Test-only cap: {wallet.fundingCapUsdc} USDC total</small></article>
            ) : (
              <article><span><ArrowDownLeft size={15} /> Simulated receipts</span><strong>{wallet.totalReceivedUsdc} USDC</strong><small>Not real earnings or payable funds</small></article>
            )}
            <article><span><ArrowUpRight size={15} /> {role === "buyer" ? "Sandbox payments" : "Test settlement"}</span><strong>{role === "buyer" ? wallet.totalPaidUsdc : wallet.totalReceivedUsdc} USDC</strong><small>Local SQLite ledger only</small></article>
          </div>

          {role === "buyer" ? (
            <>
            <div className="test-payment-actions">
              <button className="workspace-primary-button" type="button" onClick={() => void mutate("fund")} disabled={busy !== null || wallet.fundingCapReached}>
                <CircleDollarSign size={16} /> {busy === "fund" ? "Adding test credits…" : wallet.fundingCapReached ? "Test funding cap reached" : "Add 10 test USDC"}
              </button>
              <span>Sandbox faucet only · limit {wallet.fundingCapUsdc} USDC per account</span>
            </div>
            <div className="stripe-test-section">
              <div className="stripe-test-heading">
                <strong>Stripe Checkout · TEST MODE</strong>
                <span>Optional payment-provider test</span>
              </div>
              <p>Use test-mode Stripe credentials and a forwarded webhook. Successful test checkouts add non-redeemable local credits only.</p>
              <div className="stripe-test-actions">
                {[500, 1000, 2500].map((amountCents) => (
                  <button
                    key={amountCents}
                    type="button"
                    className="test-payment-small-button"
                    disabled={busy !== null || wallet.fundingCapReached}
                    onClick={() => void startStripeCheckout(amountCents)}
                  >
                    {busy === `stripe-${amountCents}` ? "Opening…" : `Pay $${(amountCents / 100).toFixed(0)} test`}
                  </button>
                ))}
              </div>
              <small>Only server-side test keys are accepted. Live-mode payments and payouts are not supported.</small>
            </div>
            </>
          ) : null}

          {role === "buyer" ? (
            <div className="test-payment-runs">
              <div className="usage-ledger-list-heading"><strong>Successful runs available for test checkout</strong><span>One sandbox payment per run</span></div>
              {runs.length === 0 ? <div className="workspace-empty-state"><strong>No completed runs yet</strong><p>Run a service from the marketplace first. Then return here to test checkout.</p></div> : runs.slice(0, 8).map((run) => {
                const isPaid = paid.has(run.id);
                const callBusy = busy === `settle-${run.id}`;
                return (
                  <article className="test-payment-run-row" key={run.id}>
                    <div className="test-payment-run-copy"><strong>{run.serviceName}</strong><span>Run #{run.id} · {run.mode === "live-api-no-payment" ? "Live API response" : "Local demo result"}</span><small>{run.createdAt} UTC</small></div>
                    <div className="test-payment-run-action"><strong>{run.priceUsdc} USDC</strong>{isPaid
                      ? <span className="test-payment-complete"><BadgeCheck size={14} /> Settled in sandbox</span>
                      : <button type="button" className="test-payment-small-button" disabled={busy !== null} onClick={() => void mutate("settle", run.id)}>{callBusy ? "Processing…" : "Pay in sandbox"}</button>}</div>
                  </article>
                );
              })}
            </div>
          ) : null}

          <div className="test-payment-history">
            <div className="usage-ledger-list-heading"><strong>Recent sandbox transactions</strong><span>{transactions.length} shown</span></div>
            {transactions.length === 0 ? <div className="workspace-empty-state"><strong>No sandbox transactions yet</strong><p>{role === "buyer" ? "Add test credits or settle a completed run to create a test transaction." : "A Buyer sandbox checkout will appear here after a test run is settled."}</p></div> : transactions.map((transaction) => (
              <article className="test-payment-history-row" key={transaction.id}>
                <span className={transaction.kind === "test-funding" ? "test-payment-ledger-icon funding" : "test-payment-ledger-icon payment"}>{transaction.kind === "test-funding" ? <ArrowDownLeft size={15} /> : role === "buyer" ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}</span>
                <div className="test-payment-history-copy"><strong>{transaction.kind === "test-funding" ? "Test credit added" : transaction.serviceName}</strong><span>{transaction.otherParty}</span><small>{transaction.reference} · {transaction.createdAt} UTC</small></div>
                <div className="test-payment-history-amount"><strong>{transaction.kind === "test-funding" ? "+" : role === "buyer" ? "−" : "+"}{transaction.amountUsdc}</strong><span>TEST USDC</span></div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {error ? <p className="test-payment-message error" role="alert">{error}</p> : null}
      {notice ? <p className="test-payment-message success" role="status">{notice}</p> : null}
      <div className="test-payment-warning"><FlaskConical size={17} /><span><strong>Simulation only:</strong> this does not use a wallet, contact a blockchain, charge real money, create redeemable USDC, or pay out Host funds.</span></div>
      <button className="test-payment-refresh" type="button" onClick={() => void load()} disabled={loading || busy !== null}><RefreshCw size={13} /> Refresh sandbox ledger</button>
    </section>
  );
}

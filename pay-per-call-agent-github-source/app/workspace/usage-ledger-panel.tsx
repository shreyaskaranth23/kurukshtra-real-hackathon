import { Activity, CircleDollarSign, Clock3, ShieldCheck } from "lucide-react";
import type { UsageEntry, UsageSummary } from "@/lib/usage-ledger";

type Props = { role: "buyer" | "host"; summary: UsageSummary; entries: UsageEntry[] };

export default function UsageLedgerPanel({ role, summary, entries }: Props) {
  const isBuyer = role === "buyer";
  return (
    <section className="workspace-panel workspace-ledger-panel usage-ledger-panel">
      <div className="workspace-panel-heading">
        <div><span className="workspace-kicker">PHASE 5 · USAGE METER</span><h2>{isBuyer ? "Your usage ledger" : "Hosted service activity"}</h2></div>
        <span className="usage-ledger-status"><ShieldCheck size={14} /> Persistent · not billed</span>
      </div>
      <p className="workspace-panel-description">
        {isBuyer
          ? "Successful agent runs are recorded with a price snapshot so you can estimate usage before payments are introduced."
          : "Completed requests are recorded against the listing price for reporting. These are not payable earnings and no money is transferred."}
      </p>
      <div className="usage-ledger-stats">
        <article><span><Activity size={15} /> Successful runs</span><strong>{summary.totalRuns}</strong><small>{summary.localDemoRuns} local demo · {summary.liveApiCalls} live API</small></article>
        <article><span><CircleDollarSign size={15} /> Total {isBuyer ? "estimated usage" : "listed request value"}</span><strong>{summary.totalEstimateUsdc} USDC</strong><small>Snapshot at time of run · not billed</small></article>
        <article><span><Clock3 size={15} /> This month</span><strong>{summary.monthEstimateUsdc} USDC</strong><small>{summary.monthRuns} successful run{summary.monthRuns === 1 ? "" : "s"} this month</small></article>
      </div>
      <div className="usage-ledger-table-wrap">
        <div className="usage-ledger-list-heading"><strong>Recent metered runs</strong><span>Amount in listed USDC</span></div>
        {entries.length === 0 ? (
          <div className="workspace-empty-state"><span className="workspace-empty-icon"><Activity size={22} /></span><strong>No metered runs yet</strong><p>Run an agent from the marketplace to create the first usage record.</p></div>
        ) : (
          <div className="usage-ledger-list">
            {entries.map((entry) => (
              <article className="usage-ledger-row" key={entry.id}>
                <div className="usage-ledger-row-icon"><Activity size={16} /></div>
                <div className="usage-ledger-row-main">
                  <strong>{entry.serviceName}</strong>
                  <span>{isBuyer ? `Host: ${entry.hostEmail}` : `Buyer: ${entry.buyerEmail}`}</span>
                  <small>Run #{entry.callId} · {entry.createdAt} UTC</small>
                </div>
                <div className="usage-ledger-row-amount">
                  <strong>{entry.amountUsdc} USDC</strong>
                  <span className={entry.mode === "live-api-no-payment" ? "usage-live-tag" : "usage-demo-tag"}>
                    {entry.mode === "live-api-no-payment" ? "LIVE API · NOT BILLED" : "DEMO · NOT BILLED"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <p className="workspace-honest-note">This is an recorded usage snapshot for completed runs. It is not a wallet balance, invoice, debt, payout, or payment settlement. Historical successful runs were migrated automatically.</p>
    </section>
  );
}

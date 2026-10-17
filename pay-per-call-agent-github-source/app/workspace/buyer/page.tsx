import { redirect } from "next/navigation";
import { Bot, CircleDollarSign, Clock3, Layers3, Search, ShieldCheck, Sparkles, WalletCards, CheckCircle2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getDemoCallStats, listDemoCalls } from "@/lib/demo-calls";
import { listMarketplaceServices } from "@/lib/service-registry";
import LogoutButton from "@/app/components/logout-button";
import ServiceBrowser from "@/app/workspace/buyer/service-browser";
import AgentRunHistory from "@/app/workspace/agent-run-history";
import { listAgentRuns } from "@/lib/agent-runs";
import { getUsageSummary, listUsageEntries } from "@/lib/usage-ledger";
import UsageLedgerPanel from "@/app/workspace/usage-ledger-panel";
import TestPaymentsPanel from "@/app/workspace/test-payments-panel";

export const runtime = "nodejs";

export default async function BuyerWorkspace() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "buyer") redirect(`/workspace/${user.role}`);
  const services = listMarketplaceServices(user.id).filter((service) => service.isActive);
  const demoStats = getDemoCallStats(user.id, "buyer");
  const recentCalls = listDemoCalls(user.id, "buyer", 5);
  const recentRuns = listAgentRuns(user.id, "buyer", 5);
  const usageSummary = getUsageSummary(user.id, "buyer");
  const usageEntries = listUsageEntries(user.id, "buyer", 8);

  return (
    <main className="workspace-root">
      <header className="workspace-topbar">
        <a className="brand workspace-brand" href="/"><span className="brand-mark"><Layers3 size={19} /></span><span className="brand-name">Pay Per Call <span>Agent</span></span></a>
        <div className="workspace-topbar-right"><span className="workspace-user"><span className="workspace-avatar">{user.email.slice(0, 1).toUpperCase()}</span>{user.email}</span><LogoutButton /></div>
      </header>
      <div className="workspace-container">
        <div className="workspace-heading-row">
          <div><div className="workspace-eyebrow"><span /> BUYER WORKSPACE</div><h1>Good to have you here.</h1><p>Find specialist agents, compare their terms, and keep each request within your spending policy.</p></div>
          <div className="workspace-role-pill"><Bot size={16} /> Buyer account</div>
        </div>

        <section className="workspace-stat-grid" aria-label="Account overview">
          <article className="workspace-stat-card"><span className="workspace-stat-icon"><WalletCards size={19} /></span><span className="workspace-stat-label">Wallet</span><strong>Not connected</strong><small>Base Sepolia · testnet</small></article>
          <article className="workspace-stat-card"><span className="workspace-stat-icon"><CircleDollarSign size={19} /></span><span className="workspace-stat-label">Demo spend</span><strong>{demoStats.totalUsdc} USDC</strong><small>Simulated only · no real payment</small></article>
          <article className="workspace-stat-card"><span className="workspace-stat-icon"><Clock3 size={19} /></span><span className="workspace-stat-label">Demo requests</span><strong>{demoStats.count}</strong><small>Recorded in local activity</small></article>
          <article className="workspace-stat-card"><span className="workspace-stat-icon"><Search size={19} /></span><span className="workspace-stat-label">Active listings</span><strong>{services.length}</strong><small>Stored in the service registry</small></article>
        </section>

        <UsageLedgerPanel role="buyer" summary={usageSummary} entries={usageEntries} />
        <TestPaymentsPanel role="buyer" />

        <section className="workspace-main-grid">
          <article className="workspace-panel buyer-task-panel">
            <div className="workspace-panel-heading"><div><span className="workspace-kicker">AGENT ORCHESTRATION</span><h2>What do you need done?</h2></div><span className="workspace-panel-icon"><Sparkles size={19} /></span></div>
            <p className="workspace-panel-description">Task planning comes after the registry. For now, browse and compare the actual service listings below; the task box is a disabled preview.</p>
            <label className="workspace-label" htmlFor="buyer-task">Your task</label>
            <textarea id="buyer-task" className="workspace-textarea" placeholder="Example: Find three 5-star books, convert the prices to INR, and summarize them in Hindi." disabled />
            <div className="workspace-form-row">
              <label className="workspace-field"><span>Task budget (USDC)</span><input type="number" value="0.050" readOnly aria-label="Task budget preview" /></label>
              <label className="workspace-field"><span>Max concurrency</span><input type="number" value="3" readOnly aria-label="Concurrency preview" /></label>
            </div>
            <button className="workspace-primary-button" disabled><Sparkles size={16} /> AI planner will be connected later</button>
            <p className="workspace-honest-note">No task is executed and no payment is sent from this screen yet.</p>
          </article>
          <aside className="workspace-panel workspace-side-panel">
            <span className="workspace-kicker">BUYER SAFETY</span><h2>Before making a paid call</h2>
            <div className="workspace-check-item"><span className="workspace-check-number">01</span><div><strong>Use a fresh testnet wallet</strong><p>Base Sepolia only. Never paste a wallet private key into this website.</p></div></div>
            <div className="workspace-check-item"><span className="workspace-check-number">02</span><div><strong>Set a strict spending policy</strong><p>Choose a total task budget, per-call ceiling and manual or capped automatic approval.</p></div></div>
            <div className="workspace-check-item"><span className="workspace-check-number">03</span><div><strong>Check the registered contract</strong><p>Compare the endpoint, recipient, network, price and schemas before paying.</p></div></div>
            <div className="workspace-testnet-note"><ShieldCheck size={17} /><span><strong>Registry only at this stage</strong><br />Search is connected to SQLite. Wallet signing and x402 payments have not been connected.</span></div>
          </aside>
        </section>
        <ServiceBrowser initialServices={services} />
        <AgentRunHistory runs={recentRuns} role="buyer" />
        <section className="workspace-panel workspace-ledger-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">ACTIVITY</span><h2>Recent demo requests</h2></div><span className="workspace-empty-tag">Simulation only</span></div>{recentCalls.length === 0 ? <div className="workspace-empty-state"><span className="workspace-empty-icon"><Search size={22} /></span><strong>No demo requests yet</strong><p>Browse the marketplace and choose “Record demo request” on a listing to see activity here.</p></div> : <div className="demo-call-list">{recentCalls.map((call) => <article className="demo-call-row" key={call.id}><span className="demo-call-status"><CheckCircle2 size={16} /></span><div className="demo-call-main"><strong>{call.serviceName}</strong><span>Host: {call.hostEmail}</span><small>{call.createdAt} UTC · Request #{call.id}</small></div><div className="demo-call-price"><strong>{call.priceUsdc} USDC</strong><span>SIMULATED</span></div></article>)}</div>}<p className="workspace-honest-note">Demo requests only: no service endpoint is invoked, no wallet is used and no payment is sent.</p></section>
        <footer className="workspace-footer"><span>Pay Per Call Agent</span><span><span className="workspace-footer-dot" /> Service registry connected · Base Sepolia payments pending</span></footer>
      </div>
    </main>
  );
}

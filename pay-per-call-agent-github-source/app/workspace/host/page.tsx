import { redirect } from "next/navigation";
import { Activity, Clock3, Layers3, Server, ShieldCheck, WalletCards } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getDemoCallStats, listDemoCalls } from "@/lib/demo-calls";
import { listHostServices } from "@/lib/service-registry";
import LogoutButton from "@/app/components/logout-button";
import HostServices from "@/app/workspace/host/host-services";
import AgentRunHistory from "@/app/workspace/agent-run-history";
import { listAgentRuns } from "@/lib/agent-runs";
import { getUsageSummary, listUsageEntries } from "@/lib/usage-ledger";
import UsageLedgerPanel from "@/app/workspace/usage-ledger-panel";
import TestPaymentsPanel from "@/app/workspace/test-payments-panel";

export const runtime = "nodejs";

export default async function HostWorkspace() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "host") redirect(`/workspace/${user.role}`);
  const services = listHostServices(user.id);
  const activeCount = services.filter((service) => service.isActive).length;
  const demoStats = getDemoCallStats(user.id, "host");
  const recentCalls = listDemoCalls(user.id, "host", 5);
  const recentRuns = listAgentRuns(user.id, "host", 5);
  const usageSummary = getUsageSummary(user.id, "host");
  const usageEntries = listUsageEntries(user.id, "host", 8);

  return (
    <main className="workspace-root">
      <header className="workspace-topbar">
        <a className="brand workspace-brand" href="/"><span className="brand-mark"><Layers3 size={19} /></span><span className="brand-name">Pay Per Call <span>Agent</span></span></a>
        <div className="workspace-topbar-right"><span className="workspace-user"><span className="workspace-avatar">{user.email.slice(0, 1).toUpperCase()}</span>{user.email}</span><LogoutButton /></div>
      </header>
      <div className="workspace-container">
        <div className="workspace-heading-row">
          <div><div className="workspace-eyebrow"><span /> SERVER HOST WORKSPACE</div><h1>Make your service available.</h1><p>Publish a specialist agent, define clear per-call terms, and monitor performance.</p></div>
          <div className="workspace-role-pill"><Server size={16} /> Server host account</div>
        </div>
        <section className="workspace-stat-grid" aria-label="Host overview">
          <article className="workspace-stat-card"><span className="workspace-stat-icon"><Layers3 size={19} /></span><span className="workspace-stat-label">Registered services</span><strong>{services.length}</strong><small>{activeCount} active in the registry</small></article>
          <article className="workspace-stat-card"><span className="workspace-stat-icon"><WalletCards size={19} /></span><span className="workspace-stat-label">Simulated earnings</span><strong>{demoStats.totalUsdc} USDC</strong><small>Not real or payable earnings</small></article>
          <article className="workspace-stat-card"><span className="workspace-stat-icon"><Activity size={19} /></span><span className="workspace-stat-label">Demo requests</span><strong>{demoStats.count}</strong><small>Recorded by Buyer demo actions</small></article>
          <article className="workspace-stat-card"><span className="workspace-stat-icon"><Clock3 size={19} /></span><span className="workspace-stat-label">Availability</span><strong>{activeCount ? "Configured" : "Not configured"}</strong><small>Service-specific hours stored in listings</small></article>
        </section>
        <UsageLedgerPanel role="host" summary={usageSummary} entries={usageEntries} />
        <TestPaymentsPanel role="host" />
        <HostServices initialServices={services} />
        <AgentRunHistory runs={recentRuns} role="host" />
        <section className="workspace-panel workspace-ledger-panel"><div className="workspace-panel-heading"><div><span className="workspace-kicker">REQUEST ACTIVITY</span><h2>Recent demo requests</h2></div><span className="workspace-empty-tag">Simulation only</span></div>{recentCalls.length === 0 ? <div className="workspace-empty-state"><span className="workspace-empty-icon"><Activity size={22} /></span><strong>No demo requests yet</strong><p>When a buyer records a demo request for one of your active listings, it will appear here.</p></div> : <div className="demo-call-list">{recentCalls.map((call) => <article className="demo-call-row" key={call.id}><span className="demo-call-status"><Activity size={16} /></span><div className="demo-call-main"><strong>{call.serviceName}</strong><span>Buyer: {call.buyerEmail}</span><small>{call.createdAt} UTC · Request #{call.id}</small></div><div className="demo-call-price"><strong>{call.priceUsdc} USDC</strong><span>SIMULATED</span></div></article>)}</div>}<p className="workspace-honest-note">These are local test records, not requests actually served or payments received.</p></section>
        <footer className="workspace-footer"><span>Pay Per Call Agent</span><span><span className="workspace-footer-dot" /> Service registry connected · x402 settlement not connected</span></footer>
      </div>
    </main>
  );
}

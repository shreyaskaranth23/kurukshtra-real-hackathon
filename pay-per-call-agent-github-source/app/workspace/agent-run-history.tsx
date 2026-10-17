import { Braces, CheckCircle2, TerminalSquare } from "lucide-react";
import type { listAgentRuns } from "@/lib/agent-runs";

type AgentRun = ReturnType<typeof listAgentRuns>[number];

export default function AgentRunHistory({ runs, role }: { runs: AgentRun[]; role: "buyer" | "host" }) {
  const heading = role === "buyer" ? "Your recent agent runs" : "Recent runs on your services";
  const description = role === "buyer"
    ? "Review submitted JSON and outputs from local demo runs or live API calls."
    : "Review buyer inputs and outputs for local demo runs or live API calls on your services.";

  return (
    <section className="workspace-panel workspace-ledger-panel agent-run-history">
      <div className="workspace-panel-heading"><div><span className="workspace-kicker">AGENT RUN LOG</span><h2>{heading}</h2></div><span className="workspace-empty-tag">Demo + API</span></div>
      <p className="workspace-panel-description">{description}</p>
      {runs.length === 0 ? (
        <div className="workspace-empty-state"><span className="workspace-empty-icon"><TerminalSquare size={22} /></span><strong>No agent runs yet</strong><p>Run an agent from the marketplace to create a saved input/output record here.</p></div>
      ) : (
        <div className="agent-run-history-list">
          {runs.map((run) => (
            <article className="agent-run-history-item" key={run.id}>
              <div className="agent-run-history-top"><span className="agent-run-history-icon"><CheckCircle2 size={16} /></span><div className="agent-run-history-title"><strong>{run.serviceName}</strong><span>{role === "buyer" ? `Host: ${run.hostEmail}` : `Buyer: ${run.buyerEmail}`}</span><small>Run #{run.id} · {run.createdAt} UTC · {run.durationMs} ms</small></div><div className="demo-call-price"><strong>{run.priceUsdc} USDC</strong><span>{run.mode === "live-api-no-payment" ? "API CALLED · NO PAYMENT" : "SIMULATED"}</span></div></div>
              <details className="agent-run-history-details"><summary><Braces size={14} /> View JSON input and output</summary><div className="agent-run-history-json"><div><span>INPUT</span><pre>{JSON.stringify(run.input, null, 2)}</pre></div><div><span>OUTPUT</span><pre>{JSON.stringify(run.output, null, 2)}</pre></div></div></details>
            </article>
          ))}
        </div>
      )}
      <p className="workspace-honest-note">Run history is stored in local SQLite. Runs marked API CALLED represent a real endpoint response; listed prices remain informational and no payment is settled.</p>
    </section>
  );
}

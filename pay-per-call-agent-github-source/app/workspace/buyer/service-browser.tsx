"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  Code2,
  Database,
  Bot,
  Globe2,
  PlayCircle,
  CheckCircle2,
  X,
  TerminalSquare,
  Clock3,
} from "lucide-react";
import type { ServiceListing, ServiceCategory } from "@/lib/service-registry";

type Props = { initialServices: ServiceListing[] };
type AgentRunView = {
  id: number;
  serviceId: number | null;
  serviceName: string;
  priceUsdc: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs: number;
  createdAt: string;
  mode: "local-demo" | "live-api-no-payment";
};

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body.error === "string" ? body.error : "The request could not be completed.";
  } catch {
    return "The request could not be completed.";
  }
}

function CategoryIcon({ category }: { category: ServiceCategory }) {
  if (category === "scraping") return <Globe2 size={17} />;
  if (category === "inference") return <Bot size={17} />;
  return <Database size={17} />;
}

function sampleInput(service: ServiceListing): Record<string, unknown> {
  const properties = service.inputSchema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
  const sample: Record<string, unknown> = {};
  for (const [key, rawRule] of Object.entries(properties as Record<string, unknown>)) {
    const rule = rawRule && typeof rawRule === "object" && !Array.isArray(rawRule)
      ? rawRule as Record<string, unknown>
      : {};
    const fieldName = key.toLowerCase();
    if (rule.type === "string") {
      sample[key] = fieldName.includes("text") || fieldName.includes("content")
        ? "Pay-per-call services let software request a specialist agent for a specific task. This local example demonstrates request input and output handling without calling an external API."
        : fieldName.includes("query") || fieldName.includes("search")
          ? "sample demo query"
          : "sample input";
    } else if (rule.type === "integer" || rule.type === "number") sample[key] = 1;
    else if (rule.type === "boolean") sample[key] = true;
    else if (rule.type === "array") sample[key] = [];
    else if (rule.type === "object") sample[key] = {};
    else if (rule.type === "null") sample[key] = null;
    else sample[key] = null;
  }
  return sample;
}

export default function ServiceBrowser({ initialServices }: Props) {
  const router = useRouter();
  const [services, setServices] = useState(initialServices.filter((service) => service.isActive));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [count, setCount] = useState(services.length);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [inputJson, setInputJson] = useState("{}");
  const [runResult, setRunResult] = useState<AgentRunView | null>(null);
  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category !== "all") params.set("category", category);
    if (maxPrice.trim()) params.set("maxPrice", maxPrice.trim());
    try {
      const response = await fetch(`/api/services?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) { setError(await responseError(response)); return; }
      const body = await response.json() as { services: ServiceListing[]; count: number };
      const active = body.services.filter((service) => service.isActive);
      setServices(active);
      setCount(active.length);
    } catch {
      setError("Could not reach the service registry. Make sure the app is running.");
    } finally {
      setBusy(false);
    }
  }

  async function resetFilters() {
    setQuery(""); setCategory("all"); setMaxPrice(""); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/services", { cache: "no-store" });
      if (!response.ok) { setError(await responseError(response)); return; }
      const body = await response.json() as { services: ServiceListing[] };
      const active = body.services.filter((service) => service.isActive);
      setServices(active); setCount(active.length);
    } catch {
      setError("Could not reset filters.");
    } finally {
      setBusy(false);
    }
  }

  function openRunner(service: ServiceListing) {
    setSelectedServiceId(service.id);
    setInputJson(JSON.stringify(sampleInput(service), null, 2));
    setRunResult(null);
    setError("");
    setNotice("");
  }

  async function runAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService) return;
    setRunBusy(true);
    setError("");
    setNotice("");
    let input: unknown;
    try {
      input = JSON.parse(inputJson);
    } catch {
      setError("Input is not valid JSON. Fix the syntax and try again.");
      setRunBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/agent-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: selectedService.id, input }),
      });
      if (!response.ok) { setError(await responseError(response)); return; }
      const body = await response.json() as { run: AgentRunView };
      setRunResult(body.run);
      setNotice(body.run.mode === "live-api-no-payment" ? `Live API response received for run #${body.run.id} in ${body.run.durationMs} ms. No payment was taken.` : `Local demo run #${body.run.id} completed in ${body.run.durationMs} ms. No external API or payment was used.`);
      router.refresh();
    } catch {
      setError("Could not run the local agent demo. Check that the local server is running.");
    } finally {
      setRunBusy(false);
    }
  }

  return (
    <section className="workspace-panel registry-list-panel buyer-registry-panel">
      <div className="workspace-panel-heading"><div><span className="workspace-kicker">SERVICE MARKETPLACE</span><h2>Discover specialist agents</h2></div><span className="workspace-panel-icon"><Search size={19} /></span></div>
      <p className="workspace-panel-description">Search active listings, inspect each input/output contract, and run the service with JSON input. Services enabled by their host can call a real external HTTPS API; otherwise they run locally.</p>
      <form className="registry-search-form" onSubmit={search}>
        <label className="workspace-field registry-query-field"><span>Search services</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. currency, Hindi summary, books" /></label>
        <label className="workspace-field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option><option value="data">Data</option><option value="inference">Inference</option><option value="scraping">Scraping</option></select></label>
        <label className="workspace-field"><span>Max price (USDC)</span><input inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="0.010" /></label>
        <button className="workspace-primary-button registry-search-button" type="submit" disabled={busy}><Search size={15} /> {busy ? "Searching…" : "Search"}</button>
        <button className="registry-secondary-button registry-reset-button" type="button" onClick={resetFilters} disabled={busy}><SlidersHorizontal size={15} /> Reset</button>
      </form>
      {error && <p className="registry-message registry-error" role="alert">{error}</p>}
      {notice && <p className="registry-message registry-success" role="status"><CheckCircle2 size={15} /> {notice}</p>}

      {selectedService && (
        <section className="agent-runner-panel" aria-label="Local agent runner">
          <div className="agent-runner-heading">
            <div><span className="workspace-kicker">{selectedService.externalEnabled ? "LIVE API RUNNER" : "LOCAL EXECUTION SANDBOX"}</span><h3>Run {selectedService.name}</h3><p>Enter a JSON object that follows the listing's input schema.</p></div>
            <button type="button" className="agent-runner-close" onClick={() => { setSelectedServiceId(null); setRunResult(null); }} aria-label="Close runner"><X size={17} /></button>
          </div>
          <div className="agent-runner-schema"><strong>Required input schema</strong><pre>{JSON.stringify(selectedService.inputSchema, null, 2)}</pre></div>
          <form onSubmit={runAgent}>
            <label className="workspace-field"><span>Input JSON</span><textarea className="agent-runner-textarea" spellCheck={false} value={inputJson} onChange={(event) => setInputJson(event.target.value)} rows={8} /></label>
            <div className="agent-runner-actions"><button className="workspace-primary-button" type="submit" disabled={runBusy}>{runBusy ? "Running agent…" : <><PlayCircle size={16} /> Run Agent</>}</button><span><Clock3 size={14} /> {selectedService.externalEnabled ? "Real HTTPS API call · no payment" : "Local-only test · no external request"}</span></div>
          </form>
          {runResult && <div className="agent-runner-output"><div><span className="workspace-kicker">OUTPUT JSON</span><span className="agent-runner-duration">Run #{runResult.id} · {runResult.durationMs} ms</span></div><pre>{JSON.stringify(runResult.output, null, 2)}</pre><details><summary>View submitted input</summary><pre>{JSON.stringify(runResult.input, null, 2)}</pre></details></div>}
        </section>
      )}

      <div className="registry-results-label"><span>{count} active listing{count === 1 ? "" : "s"}</span><span><span className="registry-network-dot" /> Base Sepolia registry</span></div>
      {services.length === 0 ? <div className="workspace-empty-state"><span className="workspace-empty-icon"><Search size={22} /></span><strong>No active services found</strong><p>Try another query or category, or sign in as a Server Host to publish a listing. Listings appear here after a host saves them.</p></div> : (
        <div className="registry-service-list registry-buyer-results">{services.map((service) => <article className="registry-service-card registry-buyer-card" key={service.id}>
          <div className="registry-service-main"><span className={`registry-category registry-category-${service.category}`}><CategoryIcon category={service.category} /> {service.category}</span><h3>{service.name}</h3><p>{service.description}</p><div className="registry-service-meta"><span>Seller: {service.hostLabel}</span><span>{service.workingHoursStart}–{service.workingHoursEnd} {service.timezone}</span><span>Limit {service.maxCallsPerHour.toLocaleString()}/hour</span></div><details className="registry-contract-details"><summary><Code2 size={14} /> View endpoint and contract</summary><div><span>{service.externalEnabled ? "Live endpoint enabled" : "Registered endpoint (not contacted)"}</span><code>{service.endpointUrl}</code><span>Receiving address</span><code>{service.payTo}</code><span>Input schema</span><pre>{JSON.stringify(service.inputSchema, null, 2)}</pre><span>Output schema</span><pre>{JSON.stringify(service.outputSchema, null, 2)}</pre></div></details></div>
          <div className="registry-service-right"><strong>{service.priceUsdc} <small>USDC/call</small></strong><span className={service.externalEnabled ? "registry-state registry-state-active" : "registry-state registry-state-paused"}>{service.externalEnabled ? "Live API enabled" : "Demo mode"}</span><span className="registry-price-footnote">Listed price · not a real charge</span><button className="workspace-primary-button demo-call-button" type="button" onClick={() => openRunner(service)}><TerminalSquare size={15} /> Run Agent</button></div>
        </article>)}</div>
      )}
      <p className="workspace-honest-note">Services enabled by their host send JSON to a public HTTPS endpoint. Use only non-sensitive test input. The app stores run history, but listed prices are not charged and no payments are settled.</p>
    </section>
  );
}

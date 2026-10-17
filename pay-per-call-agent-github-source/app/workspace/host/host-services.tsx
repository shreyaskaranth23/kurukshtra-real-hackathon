"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CheckCircle2, Clock3, Code2, Edit3, Pause, Play, PlusCircle, Save, Server, Trash2, WalletCards, X } from "lucide-react";
import type { ServiceListing, ServiceCategory } from "@/lib/service-registry";

type Props = { initialServices: ServiceListing[] };
type FormState = {
  name: string; category: ServiceCategory; endpointUrl: string; priceUsdc: string; payTo: string;
  description: string; inputSchema: string; outputSchema: string; workingHoursStart: string;
  workingHoursEnd: string; timezone: string; maxCallsPerHour: string; maxConcurrency: string;
  apiKey: string; apiKeyHeader: "authorization" | "x-api-key"; liveEnabled: boolean; clearApiKey: boolean;
};

const emptyForm: FormState = {
  name: "", category: "data", endpointUrl: "https://example.com/api/service", priceUsdc: "0.001000",
  payTo: "", description: "", inputSchema: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
  outputSchema: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
  workingHoursStart: "00:00", workingHoursEnd: "23:59", timezone: "Asia/Kolkata",
  maxCallsPerHour: "100", maxConcurrency: "3", apiKey: "", apiKeyHeader: "authorization", liveEnabled: false, clearApiKey: false,
};

async function responseError(response: Response): Promise<string> {
  try { const body = await response.json(); return typeof body.error === "string" ? body.error : "Something went wrong."; }
  catch { return "Something went wrong. Please retry."; }
}

export default function HostServices({ initialServices }: Props) {
  const router = useRouter();
  const [services, setServices] = useState(initialServices);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(initialServices.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);

  const activeCount = useMemo(() => services.filter((service) => service.isActive).length, [services]);
  const priceTotalHint = "Listed price is capped at 0.10 USDC per request. The registry does not execute payments.";

  function startNew() {
    setEditingId(null); setForm(emptyForm); setHasSavedApiKey(false); setError(""); setNotice(""); setShowForm(true);
  }

  async function startEdit(service: ServiceListing) {
    setEditingId(service.id);
    setForm({
      name: service.name, category: service.category, endpointUrl: service.endpointUrl,
      priceUsdc: service.priceUsdc, payTo: service.payTo, description: service.description,
      inputSchema: JSON.stringify(service.inputSchema, null, 2), outputSchema: JSON.stringify(service.outputSchema, null, 2),
      workingHoursStart: service.workingHoursStart, workingHoursEnd: service.workingHoursEnd,
      timezone: service.timezone, maxCallsPerHour: String(service.maxCallsPerHour), maxConcurrency: String(service.maxConcurrency),
      apiKey: "", apiKeyHeader: "authorization", liveEnabled: false, clearApiKey: false,
    });
    setHasSavedApiKey(false);
    setError(""); setNotice(""); setShowForm(true);
    document.getElementById("service-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const response = await fetch(`/api/services/${service.id}/credentials`, { cache: "no-store" });
      if (response.ok) {
        const settings = await response.json() as { hasApiKey: boolean; liveEnabled: boolean; apiKeyHeader: "authorization" | "x-api-key" };
        setHasSavedApiKey(settings.hasApiKey);
        setForm((current) => ({ ...current, liveEnabled: settings.liveEnabled, apiKeyHeader: settings.apiKeyHeader }));
      }
    } catch { /* The listing remains editable even if settings cannot be loaded. */ }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { apiKey, apiKeyHeader, liveEnabled, clearApiKey, ...listingForm } = form;
    const payload = { ...listingForm, maxCallsPerHour: Number(form.maxCallsPerHour), maxConcurrency: Number(form.maxConcurrency) };
    try {
      const response = await fetch(editingId ? `/api/services/${editingId}` : "/api/services", {
        method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) { setError(await responseError(response)); return; }
      const body = await response.json() as { service: ServiceListing };
      const listing = body.service;
      setServices((current) => editingId ? current.map((item) => item.id === listing.id ? listing : item) : [listing, ...current]);
      const settingsResponse = await fetch(`/api/services/${listing.id}/credentials`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveEnabled, apiKey, apiKeyHeader, clearApiKey: clearApiKey && !apiKey.trim() }),
      });
      router.refresh();
      if (!settingsResponse.ok) {
        setEditingId(listing.id);
        setError(`Listing saved, but API settings could not be saved: ${await responseError(settingsResponse)}`);
        setNotice("");
        return;
      }
      setNotice(form.liveEnabled ? "Service listing and live API settings saved. No payment is enabled." : "Service listing saved. Agent runs will use local demo mode.");
      setEditingId(null); setForm(emptyForm); setHasSavedApiKey(false); setShowForm(false);
    } catch { setError("Could not reach the registry API. Check that the development server is running."); }
    finally { setBusy(false); }
  }

  async function toggleActive(service: ServiceListing) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/services/${service.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !service.isActive }) });
      if (!response.ok) { setError(await responseError(response)); return; }
      const body = await response.json() as { service: ServiceListing };
      setServices((current) => current.map((item) => item.id === service.id ? body.service : item));
      router.refresh();
      setNotice(body.service.isActive ? "Service is visible in the marketplace." : "Service paused and hidden from buyers.");
    } catch { setError("Could not update service status."); }
    finally { setBusy(false); }
  }

  async function removeService(service: ServiceListing) {
    if (!window.confirm(`Delete “${service.name}” from the registry?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/services/${service.id}`, { method: "DELETE" });
      if (!response.ok) { setError(await responseError(response)); return; }
      setServices((current) => current.filter((item) => item.id !== service.id));
      router.refresh();
      if (editingId === service.id) { setEditingId(null); setForm(emptyForm); }
      setNotice("Service listing deleted.");
    } catch { setError("Could not delete this service."); }
    finally { setBusy(false); }
  }

  return (
    <div className="registry-layout">
      <section className="workspace-panel registry-editor-panel" id="service-editor">
        <div className="workspace-panel-heading"><div><span className="workspace-kicker">SERVICE ONBOARDING</span><h2>{editingId ? "Edit service listing" : "Publish a service"}</h2></div><span className="workspace-panel-icon"><PlusCircle size={19} /></span></div>
        <p className="workspace-panel-description">Register your service and, when ready, enable live HTTPS JSON API execution. API keys are encrypted at rest and never returned in marketplace responses. Payments remain disabled.</p>
        {!showForm ? <button className="workspace-primary-button registry-create-button" type="button" onClick={startNew}><PlusCircle size={16} /> Add a service</button> : (
          <form className="registry-form" onSubmit={submit}>
            <div className="registry-grid-two">
              <label className="workspace-field"><span>Service name *</span><input required minLength={3} maxLength={80} value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="e.g. fx-rates" /></label>
              <label className="workspace-field"><span>Category *</span><select value={form.category} onChange={(e) => updateField("category", e.target.value as ServiceCategory)}><option value="data">Data</option><option value="inference">Inference</option><option value="scraping">Scraping</option></select></label>
            </div>
            <label className="workspace-field"><span>Endpoint URL *</span><input required type="url" value={form.endpointUrl} onChange={(e) => updateField("endpointUrl", e.target.value)} placeholder="https://your-domain.com/api/service" /><small className="registry-field-note">Live execution requires a public HTTPS endpoint that accepts POST JSON and returns a JSON object.</small></label>
            <div className="registry-grid-two">
              <label className="workspace-field"><span>Price per request (USDC) *</span><input required inputMode="decimal" value={form.priceUsdc} onChange={(e) => updateField("priceUsdc", e.target.value)} placeholder="0.001" /><small className="registry-field-note">Maximum: 0.10 USDC · 6 decimals</small></label>
              <label className="workspace-field"><span>Base Sepolia receiving address *</span><input required spellCheck={false} value={form.payTo} onChange={(e) => updateField("payTo", e.target.value)} placeholder="0x followed by 40 hex characters" /></label>
            </div>
            <label className="workspace-field"><span>Description *</span><textarea required minLength={10} maxLength={1000} className="registry-textarea" value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="Explain what the service does, what input it accepts and what result it returns." /></label>
            <details className="registry-advanced" open>
              <summary><Code2 size={16} /> Real API connection (optional)</summary>
              <label className="workspace-field" style={{ marginTop: 12 }}><span>API authentication</span><select value={form.apiKeyHeader} onChange={(e) => updateField("apiKeyHeader", e.target.value as "authorization" | "x-api-key")}><option value="authorization">Authorization: Bearer token</option><option value="x-api-key">x-api-key header</option></select></label>
              <label className="workspace-field"><span>API key / token {hasSavedApiKey ? "(saved — leave blank to keep it)" : "(optional)"}</span><input type="password" autoComplete="new-password" value={form.apiKey} onChange={(e) => updateField("apiKey", e.target.value)} placeholder={hasSavedApiKey ? "Saved securely; type to replace" : "Paste API token here"} /><small className="registry-field-note">Stored encrypted on this machine. Never put the key inside the endpoint URL. Do not paste an API secret into chat.</small></label>
              <label className="workspace-field" style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10 }}><input type="checkbox" checked={form.liveEnabled} onChange={(e) => updateField("liveEnabled", e.target.checked)} style={{ width: 18, height: 18, marginTop: 3 }} /><span><strong>Enable live API execution</strong><small className="registry-field-note" style={{ display: "block" }}>When checked, Buyer runs make a real HTTPS POST to this endpoint. Only enable URLs you control or trust. Calls may consume the provider's quota. No payment is taken.</small></span></label>
              {hasSavedApiKey && <label className="workspace-field" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}><input type="checkbox" checked={form.clearApiKey} onChange={(e) => updateField("clearApiKey", e.target.checked)} style={{ width: 18, height: 18 }} /><span>Remove saved API key</span></label>}
            </details>
            <details className="registry-advanced">
              <summary><Code2 size={16} /> JSON schemas and service policies</summary>
              <div className="registry-grid-two registry-schema-grid">
                <label className="workspace-field"><span>Input JSON Schema *</span><textarea required className="registry-code-textarea" spellCheck={false} value={form.inputSchema} onChange={(e) => updateField("inputSchema", e.target.value)} /></label>
                <label className="workspace-field"><span>Output JSON Schema *</span><textarea required className="registry-code-textarea" spellCheck={false} value={form.outputSchema} onChange={(e) => updateField("outputSchema", e.target.value)} /></label>
              </div>
              <div className="registry-grid-two">
                <label className="workspace-field"><span>Working hours start</span><input required type="time" value={form.workingHoursStart} onChange={(e) => updateField("workingHoursStart", e.target.value)} /></label>
                <label className="workspace-field"><span>Working hours end</span><input required type="time" value={form.workingHoursEnd} onChange={(e) => updateField("workingHoursEnd", e.target.value)} /></label>
              </div>
              <div className="registry-grid-three">
                <label className="workspace-field"><span>Timezone</span><input required value={form.timezone} onChange={(e) => updateField("timezone", e.target.value)} placeholder="Asia/Kolkata" /></label>
                <label className="workspace-field"><span>Calls/hour limit</span><input required type="number" min={1} max={100000} value={form.maxCallsPerHour} onChange={(e) => updateField("maxCallsPerHour", e.target.value)} /></label>
                <label className="workspace-field"><span>Concurrency limit</span><input required type="number" min={1} max={1000} value={form.maxConcurrency} onChange={(e) => updateField("maxConcurrency", e.target.value)} /></label>
              </div>
            </details>
            {error && <p className="registry-message registry-error" role="alert">{error}</p>}
            <p className="registry-field-note">{priceTotalHint} Network is fixed to Base Sepolia testnet (`eip155:84532`).</p>
            <div className="registry-form-actions"><button className="workspace-primary-button" type="submit" disabled={busy}><Save size={16} /> {busy ? "Saving…" : editingId ? "Save changes" : "Publish service"}</button><button className="registry-secondary-button" type="button" disabled={busy} onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); setError(""); }}><X size={16} /> Cancel</button></div>
          </form>
        )}
        {notice && <p className="registry-message registry-success" role="status"><CheckCircle2 size={15} /> {notice}</p>}
      </section>

      <aside className="workspace-panel workspace-side-panel registry-summary-panel">
        <span className="workspace-kicker">HOST OVERVIEW</span><h2>Registry summary</h2>
        <div className="registry-summary-stat"><span>All listings</span><strong>{services.length}</strong></div>
        <div className="registry-summary-stat"><span>Active and searchable</span><strong>{activeCount}</strong></div>
        <div className="registry-summary-stat"><span>Paused</span><strong>{services.length - activeCount}</strong></div>
        <div className="workspace-testnet-note"><WalletCards size={17} /><span><strong>Testnet listing only</strong><br />Saving a price and address does not authorize or transfer funds. Settlement will be connected after x402 support is added.</span></div>
        <div className="workspace-coming-list"><div><Clock3 size={17} /><span><strong>Schedule metadata</strong><small>Each service stores its time window and timezone.</small></span></div><div><Activity size={17} /><span><strong>Request limits</strong><small>Call-per-hour and concurrency limits are stored for enforcement by the seller runtime in a later step.</small></span></div></div>
      </aside>

      <section className="workspace-panel workspace-ledger-panel registry-list-panel">
        <div className="workspace-panel-heading"><div><span className="workspace-kicker">YOUR CATALOGUE</span><h2>My services</h2></div><span className="workspace-empty-tag">{services.length} listing{services.length === 1 ? "" : "s"}</span></div>
        {services.length === 0 ? <div className="workspace-empty-state"><span className="workspace-empty-icon"><Server size={22} /></span><strong>No services published yet</strong><p>Add your first service above. It will be stored in the local registry and become searchable by signed-in buyers.</p></div> : (
          <div className="registry-service-list">{services.map((service) => <article className="registry-service-card" key={service.id}>
            <div className="registry-service-main"><span className={`registry-category registry-category-${service.category}`}>{service.category}</span><h3>{service.name}</h3><p>{service.description}</p><code>{service.endpointUrl}</code><div className="registry-service-meta"><span>{service.workingHoursStart}–{service.workingHoursEnd} {service.timezone}</span><span>{service.maxCallsPerHour.toLocaleString()} calls/hour</span><span>Concurrency {service.maxConcurrency}</span></div></div>
            <div className="registry-service-right"><strong>{service.priceUsdc} <small>USDC/call</small></strong><span className={service.isActive ? "registry-state registry-state-active" : "registry-state registry-state-paused"}>{service.isActive ? "Active" : "Paused"}</span><div className="registry-icon-actions"><button type="button" title="Edit service" aria-label={`Edit ${service.name}`} onClick={() => void startEdit(service)} disabled={busy}><Edit3 size={15} /></button><button type="button" title={service.isActive ? "Pause service" : "Activate service"} aria-label={service.isActive ? `Pause ${service.name}` : `Activate ${service.name}`} onClick={() => void toggleActive(service)} disabled={busy}>{service.isActive ? <Pause size={15} /> : <Play size={15} />}</button><button type="button" title="Delete service" aria-label={`Delete ${service.name}`} onClick={() => void removeService(service)} disabled={busy}><Trash2 size={15} /></button></div></div>
          </article>)}</div>
        )}
        {error && !showForm && <p className="registry-message registry-error" role="alert">{error}</p>}
        <p className="workspace-honest-note">Listings and API settings are saved in SQLite. Live calls are disabled unless the host explicitly enables them; no payment is settled.</p>
      </section>
    </div>
  );
}

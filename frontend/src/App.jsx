
import { useEffect, useState } from "react";
import "./App.css";

const API = "";

export default function App() {
  const [agents, setAgents] = useState([]);
  const [backend, setBackend] = useState("Checking...");
  const [url, setUrl] = useState("https://books.toscrape.com/");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("scrape");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/health`).then((r) => {
        if (!r.ok) throw new Error("Backend unavailable");
        return r.json();
      }),
      fetch(`${API}/registry`).then((r) => {
        if (!r.ok) throw new Error("Registry unavailable");
        return r.json();
      }),
    ])
      .then(([health, registry]) => {
        setBackend(health.status === "online" ? "Online" : "Unavailable");
        setAgents(registry.agents || []);
      })
      .catch(() => setBackend("Unavailable"));
  }, []);

  async function runExtractor() {
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${API}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            title: "Agent Economy Demo",
            description: "Sample webpage data for the extractor.",
            headings: ["Introduction", "Features", "Results"],
            links: [
              { label: "Example", url: "https://example.com" },
            ],
            text: "This is sample content processed by the structured data extractor.",
            url: "https://example.com",
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Extraction failed");
      setResult(data);
    } catch (e) {
      setError(e.message || "Could not reach the backend.");
    } finally {
      setBusy(false);
    }
  }

  
async function runScraper() {
  if (!window.confirm(
    "This calls the paid scraper and may spend 0.001 test USDC. Continue?"
  )) {
    return;
  }

  setBusy(true);
  setError("");
  setResult(null);

  try {
    // 1. Scrape the real webpage (one paid request).
    const scrapeResponse = await fetch(`${API}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok) {
      throw new Error(scrapeData.error || "Paid scraping failed.");
    }

    // 2. Extract structured data from the actual scrape result.
    const extractResponse = await fetch(`${API}/api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: scrapeData.result }),
    });

    const extractData = await extractResponse.json();

    if (!extractResponse.ok) {
      throw new Error(
        extractData.error || "Extraction failed after scraping."
      );
    }

    // 3. Display both outputs together.
    setResult({
      status: "success",
      workflow: "scrape-and-extract",
      sourceUrl: url,
      payment: scrapeData.payment,
      scrapedData: scrapeData.result,
      extraction: extractData.result,
    });
  } catch (e) {
    setError(e.message || "The workflow failed.");
  } finally {
    setBusy(false);
  }
}


  // Prepare a compact, human-readable summary while preserving the full response.
  const extraction =
    result?.extraction ??
    (result?.result?.service === "structured-data-extractor" ? result.result : null);
  const scraped = result?.scrapedData;
  const extractedData = extraction?.data;
  const headings = extractedData?.headings ?? scraped?.headings ?? [];
  const links = extractedData?.links ?? scraped?.links ?? [];
  const pageTitle = extractedData?.title ?? scraped?.title ?? "Untitled page";
  const sourceUrl = result?.sourceUrl ?? scraped?.url ?? extraction?.sourceUrl ?? "Sample data";

  let paymentDetails = null;
  try {
    const header = result?.payment?.responseHeader;
    if (header) paymentDetails = JSON.parse(atob(header));
  } catch {
    // The raw response remains available even if payment metadata cannot be decoded.
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">A</div>
          <div>
            <strong>Agent Economy</strong>
            <span>PAY-PER-USE NETWORK</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <a className="nav-item active" href="#overview">◈ Overview</a>
        <a className="nav-item" href="#agents">◎ Agent marketplace</a>
        <a className="nav-item" href="#playground">⌘ Playground</a>

        <div className="sidebar-bottom">
          <span className={`status-dot ${backend === "Online" ? "online" : ""}`} />
          <div>
            <strong>Backend {backend}</strong>
            <span>localhost:3001</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> Overview</div>
          <div className="network-pill"><span /> Base Sepolia</div>
        </header>

        <section className="welcome">
          <div>
            <div className="eyebrow">DECENTRALIZED SERVICES</div>
            <h1>Your agents.<br /><span>One economy.</span></h1>
            <p>Discover services, process data, and explore pay-per-use agents through one interface.</p>
          </div>
          <div className="hero-mark">A<span>↗</span></div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <span>REGISTERED AGENTS</span>
            <strong>{agents.length}</strong>
            <small>From the live registry</small>
          </div>
          <div className="stat-card">
            <span>BACKEND STATUS</span>
            <strong className={backend === "Online" ? "good" : ""}>{backend}</strong>
            <small>Express API · Port 3001</small>
          </div>
          <div className="stat-card">
            <span>SCRAPER PRICE</span>
            <strong>$0.001</strong>
            <small>USDC · Base Sepolia</small>
          </div>
        </section>

        <section className="section" id="agents">
          <div className="section-heading">
            <div>
              <div className="eyebrow">DISCOVER</div>
              <h2>Agent marketplace</h2>
            </div>
            <span className="count-pill">{agents.length} registered</span>
          </div>

          <div className="agent-grid">
            {agents.map((agent) => (
              <article className="agent-card" key={agent.id}>
                <div className="agent-card-top">
                  <div className="agent-icon">{agent.id === "web-scraper" ? "⌘" : "◇"}</div>
                  <span className="available"><i /> Available</span>
                </div>
                <div className="eyebrow">{agent.category}</div>
                <h3>{agent.name}</h3>
                <p>{agent.description}</p>
                <div className="agent-meta">
                  <span>{agent.method} {agent.endpoint}</span>
                  <strong>{agent.price === "free" ? "FREE" : `${agent.price} ${agent.currency || "USDC"}`}</strong>
                </div>
              </article>
            ))}
            {agents.length === 0 && (
              <div className="empty-state">
                No agents loaded. Check that the backend is running and /registry is reachable.
              </div>
            )}
          </div>
        </section>

        <section className="section playground" id="playground">
          <div className="section-heading">
            <div>
              <div className="eyebrow">TRY IT YOURSELF</div>
              <h2>Agent playground</h2>
            </div>
            <span className="count-pill">Interactive demo</span>
          </div>

          <div className="playground-card">
            <div className="tabs">
              <button className={mode === "scrape" ? "tab selected" : "tab"} onClick={() => { setMode("scrape"); setResult(null); setError(""); }}>
                <span>⌘</span> Paid scraping
              </button>
              <button className={mode === "extract" ? "tab selected" : "tab"} onClick={() => { setMode("extract"); setResult(null); setError(""); }}>
                <span>◇</span> Free extraction
              </button>
            </div>

            {mode === "scrape" ? (
              <div className="form-area">
                <label htmlFor="url">TARGET WEBPAGE URL</label>
                <input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
                <div className="helper-row">
                  <span>HTTPS pages only · Public webpages</span>
                  <span className="price-label">Cost: 0.001 USDC</span>
                </div>
                <button className="primary-button" disabled={busy || !url.trim()} onClick={runScraper}>
                  {busy ? "Processing..." : "Run paid scraper →"}
                </button>
                <p className="disclaimer">A real paid request may spend test USDC. You'll be asked to confirm first.</p>
              </div>
            ) : (
              <div className="form-area">
                <div className="free-note">FREE · Uses sample data · No payment required</div>
                <p>Run the structured data extractor against sample webpage data to demonstrate its output.</p>
                <button className="primary-button" disabled={busy} onClick={runExtractor}>
                  {busy ? "Processing..." : "Run sample extraction →"}
                </button>
              </div>
            )}

            {error && <div className="error-box">{error}</div>}

            {result && (
              <div className="result-area">
                <div className="result-heading">
                  <div><span className="status-dot online" /> Request completed</div>
                  <button
                    className="copy-button"
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
                  >
                    Copy JSON
                  </button>
                </div>

                <div className="result-summary">
                  <div className="summary-label">PAGE TITLE</div>
                  <h3>{pageTitle}</h3>
                  <p className="summary-url">{sourceUrl}</p>

                  <div className="summary-stats">
                    <div className="summary-stat">
                      <strong>{headings.length}</strong>
                      <span>Headings</span>
                    </div>
                    <div className="summary-stat">
                      <strong>{links.length}</strong>
                      <span>Links</span>
                    </div>
                    <div className="summary-stat">
                      <strong>{extraction ? "Complete" : "Scraped"}</strong>
                      <span>Extraction</span>
                    </div>
                  </div>

                  {paymentDetails && (
                    <div className="payment-summary">
                      <strong>
                        {paymentDetails.success
                          ? "Payment response: successful"
                          : "Payment response received"}
                      </strong>
                      {paymentDetails.transaction && (
                        <a
                          href={`https://sepolia.basescan.org/tx/${paymentDetails.transaction}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View transaction ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <details className="raw-results">
                  <summary>View complete JSON response</summary>
                  <pre>{JSON.stringify(result, null, 2)}</pre>
                </details>
              </div>
            )}
          </div>
        </section>

        <footer>AGENT ECONOMY <span>·</span> HACKATHON DEMO <span>·</span> BASE SEPOLIA</footer>
      </main>
    </div>
  );
}

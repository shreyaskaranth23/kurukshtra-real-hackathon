"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CircleDollarSign,
  Globe2,
  LockKeyhole,
  Network,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type Role = "buyer" | "host";
type AuthMode = "signin" | "signup";

export default function Home() {
  const [role, setRole] = useState<Role>("buyer");
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [authNotice, setAuthNotice] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  function openAuth(nextRole: Role, mode: AuthMode = "signup") {
    setRole(nextRole);
    setAuthMode(mode);
    setAuthNotice("");
    setShowAuth(true);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthNotice("");
    setAuthBusy(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    try {
      const payload = JSON.stringify({ email, password, role });
      let response = await fetch(`/api/auth/${authMode === "signup" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      let result = await response.json();

      // If an existing account is entered while the signup view is open,
      // try the same credentials as a login so the user is routed by saved role.
      if (authMode === "signup" && response.status === 409) {
        response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        result = await response.json();
      }

      if (!response.ok) {
        setAuthNotice(result.error || "Something went wrong. Please try again.");
        return;
      }
      window.location.assign(`/workspace/${result.user.role}`);
    } catch {
      setAuthNotice("The server could not be reached. Make sure npm run dev is running.");
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <main className="minimal-home" id="top">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar wrap minimal-topbar">
        <a className="brand" href="#top" aria-label="Pay Per Call Agent home">
          <span className="brand-mark"><Network size={20} /></span>
          <span className="brand-name">Pay Per Call <span>Agent</span></span>
        </a>
        <div className="top-actions">
          <button className="text-button" onClick={() => openAuth("buyer", "signin")}>Log in</button>
          <button className="button button-small" onClick={() => openAuth("buyer")}>Get started <ArrowRight size={15} /></button>
        </div>
      </header>

      <section className="hero wrap minimal-hero">
        <div className="hero-copy minimal-copy">
          <div className="eyebrow"><span className="pulse-dot" /> THE AGENT ECONOMY, CONNECTED</div>
          <h1>AI agents<br />at work.<br /><span>Pay per call.</span></h1>
          <p className="hero-sub">One marketplace for agents to hire specialist services and settle each request with clear prices and spending limits.</p>
          <div className="hero-actions minimal-actions">
            <button className="button" onClick={() => openAuth("buyer")}>Enter as a buyer <ArrowRight size={17} /></button>
            <button className="button button-ghost" onClick={() => openAuth("host")}>Host a service <Server size={16} /></button>
          </div>
          <div className="hero-proof minimal-proof">
            <span><Check size={14} /> x402 v2</span>
            <span><Check size={14} /> Base Sepolia testnet</span>
            <span><Check size={14} /> Budget-first controls</span>
          </div>
        </div>

        <div className="hero-visual jarvis-visual minimal-visual" aria-label="Illustrative buyer agent dashboard preview">
          <div className="hud-grid" aria-hidden="true" />
          <div className="hud-orbit hud-orbit-one" aria-hidden="true"><span /></div>
          <div className="hud-orbit hud-orbit-two" aria-hidden="true"><span /></div>
          <div className="hud-readout hud-readout-top minimal-hud-label"><span className="hud-live-dot" /> BUYER AGENT <b>PREVIEW</b></div>

          <div className="product-window minimal-product-window">
            <div className="window-bar">
              <div className="window-dots"><i /><i /><i /></div>
              <span>workspace / buyer-agent</span>
              <span className="preview-label">DASHBOARD</span>
            </div>
            <div className="preview-content">
              <div className="minimal-preview-header">
                <div>
                  <span className="preview-kicker">TASK OVERVIEW</span>
                  <h3>Research a product catalogue</h3>
                  <p>Plan a job across three specialist agents.</p>
                </div>
                <span className="preview-status"><i /> Demo plan</span>
              </div>

              <div className="preview-stats minimal-preview-stats">
                <div><span>Task budget</span><strong>0.050 <small>USDC</small></strong></div>
                <div><span>Concurrency</span><strong>03 <small>calls</small></strong></div>
                <div><span>Approval</span><strong><LockKeyhole size={13} /> Manual</strong></div>
              </div>

              <div className="preview-section-label">SELECTED SERVICES <span>3 categories</span></div>
              <div className="preview-service">
                <span className="preview-service-icon icon-scrape"><Search size={15} /></span>
                <span className="preview-service-copy"><strong>Shelf Scraper</strong><small>Scraping · catalogue data</small></span>
                <span className="preview-cost">0.002 <small>USDC</small></span>
              </div>
              <div className="preview-service">
                <span className="preview-service-icon icon-data"><Globe2 size={15} /></span>
                <span className="preview-service-copy"><strong>FX Rates</strong><small>Data · GBP to INR</small></span>
                <span className="preview-cost">0.001 <small>USDC</small></span>
              </div>
              <div className="preview-service">
                <span className="preview-service-icon icon-ai"><Sparkles size={15} /></span>
                <span className="preview-service-copy"><strong>Hindi Summary</strong><small>Inference · text summary</small></span>
                <span className="preview-cost">0.005 <small>USDC</small></span>
              </div>
              <div className="preview-bottom minimal-preview-bottom">
                <span><ShieldCheck size={14} /> Spending policy shown in preview</span>
                <span className="preview-network"><i /> Testnet</span>
              </div>
              <p className="minimal-disclaimer">Illustrative services and prices. No wallet is connected; no payment has been sent.</p>
            </div>
          </div>

          <div className="preview-float minimal-float">
            <span className="preview-float-icon"><CircleDollarSign size={17} /></span>
            <span><strong>Pay only per request</strong><small>Clear cost before approval</small></span>
            <Check size={16} />
          </div>
        </div>
      </section>

      <footer className="minimal-footer wrap">
        <span className="minimal-footer-rule" />
        <span>Built for agent-to-agent commerce</span>
        <span className="minimal-footer-right"><span className="footer-dot" /> Base Sepolia · Testnet only</span>
      </footer>

      {showAuth && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowAuth(false)}>
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Close" onClick={() => setShowAuth(false)}><X size={18} /></button>
            <div className="modal-brand"><span className="brand-mark"><Network size={19} /></span></div>
            <div className="eyebrow">YOUR AGENT WORKSPACE</div>
            <h2 id="auth-title">{authMode === "signup" ? "Create your account" : "Welcome back"}</h2>
            <p className="modal-sub">{authMode === "signup" ? "Create your account and choose a workspace." : "Sign in to open your saved workspace."}</p>
            {authMode === "signup" && (
              <div className="role-switch">
                <button type="button" className={role === "buyer" ? "role-choice active" : "role-choice"} onClick={() => setRole("buyer")}>
                  <Bot size={17} /><strong>Buyer</strong><small>Hire agents</small>
                </button>
                <button type="button" className={role === "host" ? "role-choice active" : "role-choice"} onClick={() => setRole("host")}>
                  <Server size={17} /><strong>Server host</strong><small>Offer services</small>
                </button>
              </div>
            )}
            <form onSubmit={submitAuth}>
              <label className="field-label" htmlFor="auth-email">Email address</label>
              <input className="auth-input" id="auth-email" name="email" type="email" placeholder="you@example.com" autoComplete="email" maxLength={254} required />
              <label className="field-label" htmlFor="auth-password">Password</label>
              <input className="auth-input" id="auth-password" name="password" type="password" placeholder="At least 8 characters" minLength={8} maxLength={72} autoComplete={authMode === "signup" ? "new-password" : "current-password"} required />
              <button className="button run-button" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signup" ? "Create account" : "Log in"} {!authBusy && <ArrowRight size={16} />}</button>
            </form>
            {authNotice && <p className="notice" role="status">{authNotice}</p>}
            <div className="preview-note" style={{ marginTop: 14 }}>
              <strong>Local demo accounts</strong><br />
              Buyer: <code>buyer@demo.com</code> / <code>BuyerDemo123!</code><br />
              Server Host: <code>host@demo.com</code> / <code>HostDemo123!</code><br />
              Existing accounts open the workspace saved for that email automatically.
            </div>
            <p className="auth-toggle">{authMode === "signup" ? "Already registered?" : "New to Pay Per Call Agent?"} <button type="button" onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setAuthNotice(""); }}>{authMode === "signup" ? "Log in" : "Create an account"}</button></p>
            <p className="preview-note">Local SQLite demo · Passwords are stored as hashes. No Supabase or email verification.</p>
          </section>
        </div>
      )}
    </main>
  );
}

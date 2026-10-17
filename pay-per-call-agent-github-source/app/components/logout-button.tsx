"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <button className="workspace-logout" onClick={logout} disabled={busy}>
      <LogOut size={16} /> {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

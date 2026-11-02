"use client";
import { useEffect, useState } from "react";
import type { PropertyView } from "@/lib/houses/customization";
import PropertyCards from "./property-cards";
export default function SubscriberDemoEntry() {
  const [data, setData] = useState<{ property?: PropertyView; csrfToken: string } | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/demo/subscriber", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const value = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) { setError(value.message ?? "Sign in to try the subscriber experience."); return; }
      setData(value);
    }).catch(() => { if (!controller.signal.aborted) setError("The subscriber demo is unavailable. Refresh to retry."); });
    return () => controller.abort();
  }, []);
  async function activate(action: "activate" | "reset") {
    if (!data || busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/demo/subscriber", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": data.csrfToken }, body: JSON.stringify({ action }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.message); setData(value);
    } catch { setError("The demo could not be changed. Refresh and try again."); } finally { setBusy(false); }
  }
  return <section className="workspace-card"><div className="eyebrow">Development Demo — Simulated Subscription</div><h2>{data?.property ? "My Home in Maplebrook" : "Try the subscriber journey"}</h2>
    <p>MaplebrookLive is fictional. Try your own cottage in a 15-subscriber, two-neighborhood town. No paid subscription or streamer onboarding is needed.</p>
    {data?.property && <PropertyCards houses={[data.property]} />}
    <button className="account-button" disabled={!data || busy} onClick={() => void activate(data?.property ? "reset" : "activate")}>{busy ? "Preparing…" : data?.property ? "Reset subscriber demo" : "Try Subscriber Experience"}</button>
    <p>Changes stay in this login’s local server memory for up to eight hours. Resetting or restarting the server clears them.</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}

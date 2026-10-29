"use client";
import { useEffect, useRef, useState } from "react";
import type { HousingStatus, HousingPresentation } from "@/lib/subscribers/types";
export default function SubscriberHousing({ onPresentation }: { onPresentation: (value: HousingPresentation) => void }) {
  const [status, setStatus] = useState<HousingStatus | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const lastRevision = useRef<number | null>(null), shown = useRef(new Set<string>());
  useEffect(() => {
    const controller = new AbortController(); let inFlight = false;
    async function poll() {
      if (inFlight) return; inFlight = true;
      try {
        const response = await fetch("/api/subscribers", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const data = await response.json(); if (controller.signal.aborted) return;
        if (!response.ok) { setStatus(null); setError(data.message ?? "Subscriber housing is unavailable."); return; }
        setStatus(data); setError("");
        if (data.revision !== lastRevision.current) { lastRevision.current = data.revision; window.dispatchEvent(new Event("living-town:reload")); }
        for (const presentation of data.presentations as HousingPresentation[]) if (!shown.current.has(presentation.id)) {
          shown.current.add(presentation.id); onPresentation(presentation);
          if (shown.current.size > 128) shown.current.delete(shown.current.values().next().value!);
        }
      } catch { if (!controller.signal.aborted) setError("Subscriber housing status is unavailable. Saved houses are retained."); }
      finally { inFlight = false; }
    }
    void poll(); const timer = window.setInterval(poll, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [onPresentation]);
  async function action(action: "authorize" | "sync" | "connect" | "disconnect") {
    if (!status || busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/subscribers", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": status.csrfToken }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) setError(data.message ?? "The subscriber operation failed. Please retry.");
      else if (action === "authorize") window.location.assign(data.location);
      else if (action === "sync") setStatus((current) => current ? { ...current, lastSync: data.sync } : current);
    } catch { setError("The operation could not be confirmed. Reload status before retrying."); }
    finally { setBusy(false); }
  }
  return <section className="chat-connection" aria-label="Subscriber Housing">
    <div className="chat-connection-title"><strong>Subscriber Housing</strong><span className="chat-mode">VERIFIED TWITCH DATA</span></div>
    {status && <>
      <p>Subscription permission: <strong>{status.authorized ? "authorized" : "not granted"}</strong> · Live events: {status.liveReady ? "ready (4 subscriptions)" : status.live}</p>
      <p>{status.verifiedHouses} verified houses · {status.active} active · {status.legacy} legacy · {status.availablePlots} available plots · {status.waitlisted} waitlisted</p>
      <p role="status">Last sync: {status.lastSync ? `${status.lastSync.status} · ${new Date(status.lastSync.finishedAt ?? status.lastSync.startedAt).toLocaleString()}` : "never"}</p>
      {status.lastSync && <p>Imported {status.lastSync.imported} · Updated {status.lastSync.updated} · Unchanged {status.lastSync.unchanged} · Waitlisted {status.lastSync.waitlisted} · Failed records {status.lastSync.failed}{status.lastSync.error ? ` · ${status.lastSync.error}` : ""}</p>}
      <div className="chat-actions">
        {!status.authorized && <button className="account-button" disabled={busy || !status.hasTown} onClick={() => void action("authorize")}>Authorize Subscriber Housing</button>}
        <button className="account-button" disabled={busy || !status.hasTown || !status.authorized || status.lastSync?.status === "running"} onClick={() => void action("sync")}>Sync Subscribers</button>
        <button className="account-button" disabled={busy || !status.hasTown || !status.authorized || ["connected","connecting","reconnecting"].includes(status.live)} onClick={() => void action("connect")}>Connect subscription events</button>
        <button className="account-button" disabled={busy || status.live === "disconnected"} onClick={() => void action("disconnect")}>Disconnect subscription events</button>
      </div>
      {!status.hasTown && <p>Create your persistent town first.</p>}
      {(status.deliveryError || status.pendingEvents > 0) && <p role="status">Pending events: {status.pendingEvents}. {status.deliveryError ? `Delivery issue: ${status.deliveryError}. Sync Subscribers can reconcile membership; interrupted gift celebrations may not replay.` : "Processing verified events…"}</p>}
    </>}
    {error && <p className="account-error" role="status">{error}</p>}
    <p className="chat-note">Properties are permanent. Ended subscriptions become legacy homes. The current 14 plots fill before subscribers join the waitlist. Simulated events never appear here.</p>
  </section>;
}

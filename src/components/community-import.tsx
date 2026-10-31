"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { communityMessages, type CommunityImport } from "@/lib/community/types";
import { authMessages } from "@/lib/auth/messages";
import TownLoading from "./town-loading";

type Status = { hasTown: boolean; followersAuthorized: boolean; subscribersAuthorized: boolean; csrfToken: string;
  summary: CommunityImport | null; revision: number | null; retryAt: number; persistenceError: boolean;
  live: string; liveReady: boolean; pendingEvents: number; deliveryError: string | null };
export default function CommunityImportPanel() {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0), revision = useRef<number | null>(null), active = useRef(true);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/community", { cache: "no-store", credentials: "same-origin", signal });
      const data = await response.json();
      if (!active.current || signal?.aborted) return;
      if (!response.ok) { setError(data.message ?? "Community progress could not be loaded."); return; }
      setStatus(data); setNow(Date.now()); setError("");
      if (revision.current !== null && revision.current !== data.revision) window.dispatchEvent(new Event("living-town:reload"));
      revision.current = data.revision;
    } catch { if (active.current && !signal?.aborted) setError("Community progress could not be loaded. Your town is retained."); }
  }, []);
  useEffect(() => {
    active.current = true; const controller = new AbortController();
    const initial = window.setTimeout(() => void refresh(controller.signal), 0);
    const timer = window.setInterval(() => void refresh(controller.signal), 5000);
    return () => { active.current = false; controller.abort(); clearTimeout(initial); clearInterval(timer); };
  }, [refresh]);
  async function control(action: "authorize" | "import" | "connect" | "disconnect") {
    if (!status || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/community", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": status.csrfToken }, body: JSON.stringify({ action }) });
      const data = await response.json(); if (!active.current) return;
      if (!response.ok) { setError(data.message ?? "Community action failed. Retry later."); return; }
      if (data.location) { window.location.assign(data.location); return; }
      await refresh();
    } catch { if (active.current) setError("Community action failed. Your saved progress is retained."); }
    finally { if (active.current) setBusy(false); }
  }
  const summary = status?.summary, running = summary?.status === "running", leaseHeld = (status?.retryAt ?? 0) > now;
  const message = (code: string) => communityMessages[code] ?? authMessages[code as keyof typeof authMessages] ?? "Import is incomplete. Retry when Twitch and storage are available.";
  return <section aria-labelledby="community-import-heading" className="management-section">
    <h3 id="community-import-heading">Community Import</h3>
    <p>Welcome your existing Twitch followers and active subscribers. Overlapping memberships become one resident; verified subscribers use the existing housing rules. You can skip this step and return here later.</p>
    {!status && !error && <TownLoading compact message="Loading community progress…" />}
    {error && <p role="alert" className="account-error">{error} <button className="account-button" disabled={busy} onClick={() => void refresh()}>Retry loading</button></p>}
    {status && <>
      {(!status.followersAuthorized || !status.subscribersAuthorized) && <p><button className="account-button" disabled={busy} onClick={() => void control("authorize")}>Authorize Community Import</button> Adds follower access and retains your existing Twitch permissions.</p>}
      {summary && <>
        <div className="dashboard-stats"><div><strong>{summary.followersDiscovered}</strong><span>Followers discovered</span></div><div><strong>{summary.subscribersDiscovered}</strong><span>Subscribers discovered</span></div><div><strong>{summary.uniqueResidentsImported}</strong><span>Unique residents imported</span></div><div><strong>{summary.subscriberHousesAssigned}</strong><span>Subscriber houses assigned this run</span></div></div>
        <p role="status">{summary.status === "complete" ? "Import complete." : `Import ${summary.status} · ${summary.phase}`} · {summary.pages} follower pages processed.</p>
        {summary.error && <p className="account-error">{message(summary.error)}</p>}
        <p className="workspace-help">Counts reflect this run’s saved checkpoints, including members already in town. Retrying safely rescans Twitch; it does not remove homes or reset your town.</p>
      </>}
      {running && <TownLoading compact message={`Importing ${summary.phase}… You can continue managing your town.`} />}
      {status.persistenceError && <p role="alert" className="account-error">The latest progress write failed. Completion is not confirmed. Previously saved members remain; retry after the worker lease expires.</p>}
      <div className="workspace-actions"><button className="primary-button" disabled={busy || running || leaseHeld || !status.followersAuthorized} onClick={() => void control("import")}>{summary && summary.status !== "complete" ? "Retry Community Import" : summary ? "Import community again" : "Import my community"}</button>
        <button className="account-button" disabled={busy || !status.followersAuthorized} onClick={() => void control(status.liveReady ? "disconnect" : "connect")}>{status.liveReady ? "Disconnect live follows" : "Connect live follows"}</button></div>
      {!running && leaseHeld && <p>A previous worker may still be finishing. Retry is available after {new Date(status.retryAt).toLocaleTimeString()}.</p>}
      <p>Live follows: {status.liveReady ? "subscription ready · channel.follow v2" : status.live} · {status.pendingEvents} pending.</p>
      {status.deliveryError && <p className="account-error">Live follow delivery: {message(status.deliveryError)}</p>}
      <p className="workspace-help">Historical imports settle quietly. Connect live follows to welcome genuinely new neighbors. Reconnect after a server restart.</p>
    </>}
  </section>;
}

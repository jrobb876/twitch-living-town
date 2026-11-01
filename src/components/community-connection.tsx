"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { authMessages } from "@/lib/auth/messages";
import { communityMessages } from "@/lib/community/types";
import { connectionLabel, continuation, defaultSelection, features, featureLabels, featureComplete, intentKey, missingPermissions, preferencesKey,
  selectionSchema, type Selection, type SetupStatus, type Feature } from "@/lib/community/setup-model";

const permissionHelp = {
  followers: "Read your followers, import them as neighbors and welcome new live follows.",
  subscribers: "Read your active subscribers, synchronize their housing and receive subscription events.",
  chat: "Read chat in your own channel to bring the town to life.",
};
const errorMessage = (code: string) => code === "permission_required" ? "Permission required. Select this feature and authorize Twitch, or leave it off."
  : communityMessages[code] ?? authMessages[code] ?? "This step failed. Retry when Twitch and storage are available.";

export default function CommunityConnection({ townId, compact = false }: { townId: string | null; compact?: boolean }) {
  const [status, setStatus] = useState<SetupStatus | null>(null), [selected, setSelected] = useState<Selection>(defaultSelection);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [outcomes, setOutcomes] = useState<Partial<Record<Feature, string>>>({});
  const active = useRef(false), pending = useRef(false);
  const execute = useCallback(async (action: "authorize" | "connect", choices: Selection, current: SetupStatus) => {
    if (pending.current || current.townId !== townId) return;
    pending.current = true; setBusy(true); setActionError(""); setOutcomes({}); setNotice("");
    try {
      try {
        localStorage.setItem(preferencesKey(current.townId), JSON.stringify(choices));
        if (action === "authorize") sessionStorage.setItem(intentKey, JSON.stringify({ townId: current.townId, selected: choices, expiresAt: Date.now() + 10 * 60000, phase: "authorizing" }));
      } catch { setNotice("Browser storage is unavailable. After Twitch returns, click Connect My Twitch Community to continue."); }
      const response = await fetch("/api/community/setup", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": current.csrfToken },
        body: JSON.stringify({ action, townId: current.townId, selected: choices }) });
      const data = await response.json(); if (!active.current) return;
      if (!response.ok) throw new Error(data.message ?? "Setup could not be completed. Retry safely; saved progress is retained.");
      if (action === "authorize" && data.location) { window.location.assign(data.location); return; }
      setOutcomes(data.errors ?? {});
      setNotice(data.busy ? "Another setup request is finishing. Progress will update here; retry afterward if needed." : "Setup started. Import and live connection progress will update below. Successful steps are retained.");
    } catch (failure) {
      if (active.current) setActionError(failure instanceof Error ? failure.message : "Setup could not be completed.");
      if (action === "authorize") { try { sessionStorage.removeItem(intentKey); } catch { /* No stored continuation. */ } }
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }, [townId]);
  useEffect(() => {
    if (!townId) return;
    active.current = true; const controller = new AbortController(); let inFlight = false, initialized = false;
    async function refresh() {
      if (inFlight) return; inFlight = true;
      try {
        const response = await fetch("/api/community/setup", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const data = await response.json(); if (controller.signal.aborted) return;
        if (!response.ok || data.townId !== townId) { setError(data.message ?? "Community status is unavailable. Check your account and town."); return; }
        setStatus(data); setError("");
        if (!initialized || compact) {
          initialized = true;
          try {
            const saved = selectionSchema.safeParse(JSON.parse(localStorage.getItem(preferencesKey(data.townId)) ?? "null"));
            if (saved.success) setSelected(saved.data);
            if (!compact) {
              const url = new URL(window.location.href), result = url.searchParams.get("setup");
              if (result) {
                const choices = continuation(sessionStorage.getItem(intentKey), data.townId, result);
                // Consume before submitting. Strict Mode, focus, polls and reloads
                // cannot repeat continuation; the redirect alone grants nothing.
                sessionStorage.removeItem(intentKey); url.searchParams.delete("setup");
                window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
                if (choices) { setSelected(choices); await execute("connect", choices, data); }
                else setNotice(result === "authorized" ? "Twitch returned. Choose your features and connect to continue; the pending setup expired or belongs to another town."
                  : `Twitch authorization did not complete. ${errorMessage(result)} Your existing town and successful connections are retained. Adjust the optional features and retry when ready.`);
              }
            }
          } catch { setNotice("Saved browser preferences could not be read. Choose your features to continue."); }
        }
      } catch { if (!controller.signal.aborted) setError("Community status is unavailable. Your town is retained; status will retry automatically."); }
      finally { inFlight = false; }
    }
    void refresh(); const timer = window.setInterval(refresh, 5000);
    return () => { active.current = false; controller.abort(); clearInterval(timer); };
  }, [townId, compact, execute]);
  const missing = status ? missingPermissions(status, selected) : [];
  const outcome = (feature: Feature) => status && featureComplete(status, feature) ? undefined : outcomes[feature];
  const unresolved = features.some((feature) => selected[feature] && outcome(feature));
  const summary = status ? connectionLabel(status, selected) : "Checking community connection…";
  const label = error || actionError || unresolved && !["Partially connected", "Permission required", "Importing"].includes(summary) ? "Failed — Retry" : summary;
  const rows = status && features.filter((f) => compact || selected[f]).map((feature) => <li key={feature}>
    <strong>{featureLabels[feature]}</strong>{compact && !selected[feature] ? " (not selected)" : ""}: {status.permissions[feature] ? "Permission granted" : "Permission required"}
    {feature !== "chat" && ` · Import: ${status.imports[feature].status.replace("_", " ")} (${status.imports[feature].count} records)`}
    {` · Live: ${status.live[feature].ready ? "Connected" : status.live[feature].status}`}
    {(outcome(feature) || status.live[feature].error || feature !== "chat" && status.imports[feature].error) && <p className="account-error">{errorMessage(outcome(feature) ?? status.live[feature].error ?? (feature !== "chat" ? status.imports[feature].error : null) ?? "unavailable")}</p>}
  </li>);
  return <section className="chat-connection" aria-label="Community Connection">
    <div className="chat-connection-title"><strong>Community Connection</strong><span role="status" className="chat-mode">{townId ? label : "Connect your account and create a town to get started"}</span></div>
    {compact ? <><p>Manage Twitch chat, followers, subscribers and imports in one place.</p><Link className="account-button" href="/dashboard/town#community">Manage Community Connection</Link></> : <>
      <h3>Connect My Twitch Community</h3><p>Choose the optional features you want. We’ll request missing access, import existing members quietly and connect their live updates. Leaving a feature unchecked does not revoke existing permission or disconnect it; use Advanced Settings to disconnect.</p>
      <fieldset disabled={busy}><legend>Optional Twitch features</legend>{features.map((feature) => <label className="workspace-field community-choice" key={feature}><span><input type="checkbox" checked={selected[feature]} onChange={(event) => setSelected((current) => ({ ...current, [feature]: event.target.checked }))} /> {featureLabels[feature]}</span><span>{permissionHelp[feature]}</span></label>)}</fieldset>
      {missing.length > 0 && <p>Missing access: {missing.map((f) => featureLabels[f]).join(", ")}. Twitch will ask you to approve these permissions. You can decline or uncheck any optional feature.</p>}
      <button className="primary-button" disabled={!status || busy || !features.some((f) => selected[f])} onClick={() => { if (status) void execute(missing.length ? "authorize" : "connect", selected, status); }}>{busy ? "Starting setup…" : "Connect My Twitch Community"}</button>
      <p>Already connected features are kept. Retry this action after a server restart to reconnect; completed imports are not repeated. Use Advanced Settings for deliberate reimports.</p>
    </>}
    {rows && <ul>{rows}</ul>}
    {notice && <p role="status">{notice}</p>}
    {actionError && <p role="alert" className="account-error">{actionError}</p>}
    {error && <p role="alert" className="account-error">{error} <Link href="/account">Check Twitch account</Link></p>}
  </section>;
}

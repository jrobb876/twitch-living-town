"use client";
import { useEffect, useState } from "react";
import { defaultDisplay, type DisplaySettings } from "@/lib/overlay/model";
import TownLoading from "./town-loading";

export default function ObsSettings({ townId, csrfToken }: { townId: string; csrfToken: string }) {
  const [draft, setDraft] = useState(defaultDisplay), [ready, setReady] = useState(false), [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [url, setUrl] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/town/display?townId=${encodeURIComponent(townId)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json(); if (controller.signal.aborted) return;
        if (!response.ok) { setMessage(data.message ?? "OBS settings are unavailable."); return; }
        setDraft(data.settings); setEnabled(data.enabled); setReady(true);
      }).catch(() => { if (!controller.signal.aborted) setMessage("OBS settings could not be loaded. Reload the dashboard to retry."); });
    return () => controller.abort();
  }, [townId]);
  async function act(action: "save" | "rotate" | "revoke") {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/town/display", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ townId, action, ...(action === "save" ? { settings: draft } : {}) }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.message ?? "OBS settings could not be saved."); return; }
      setEnabled(data.enabled);
      if (action === "save") setMessage("Display preferences saved. OBS will update on its next poll.");
      else if (action === "rotate") {
        setUrl(`${window.location.origin}/overlay/${townId}#key=${data.token}`);
        setMessage("New OBS URL ready. Previous URLs no longer work. Copy it before leaving this page.");
      } else { setUrl(""); setMessage("OBS access revoked. Connected overlays will close on their next poll."); }
    } catch { setMessage("Change could not be confirmed. Reload settings before retrying. Regenerate access if its URL was lost."); }
    finally { setBusy(false); }
  }
  const change = (patch: Partial<DisplaySettings>) => setDraft((current) => ({ ...current, ...patch }));
  if (!ready) return message ? <div className="workspace-card"><p role="alert">{message}</p><a className="account-button" href="/dashboard/town#obs">Reload display settings</a></div> : <TownLoading compact message="Preparing your stream view…" />;
  return <section className="workspace-card"><h3>OBS presentation</h3><p>Bring your saved town to stream. Live activity follows your Community connections, even after closing this dashboard.</p>
    <form onSubmit={(e) => { e.preventDefault(); void act("save"); }}><fieldset disabled={!ready || busy} className="workspace-form">
      <label className="workspace-field">Display mode<select value={draft.mode} onChange={(e) => change({ mode: e.target.value as DisplaySettings["mode"] })}><option value="living-town">Living Town · follow the Mayor</option><option value="spotlight">Mayor Spotlight</option></select></label>
      {draft.mode === "spotlight" && <div className="obs-options"><label className="workspace-field">Mayor position<select value={draft.side} onChange={(e) => change({ side: e.target.value as DisplaySettings["side"] })}><option value="left">Left</option><option value="right">Right</option></select></label>
        <label className="workspace-field">Background<select value={draft.background} onChange={(e) => change({ background: e.target.value as DisplaySettings["background"] })}><option value="town">Full saved town</option><option value="transparent">Transparent · Mayor only</option></select></label>
        <label className="workspace-field">Mayor scale · {draft.scale.toFixed(1)}×<input type="range" min="0.5" max="1.5" step="0.1" value={draft.scale} onChange={(e) => change({ scale: Number(e.target.value) })} /></label></div>}
      <div className="workspace-actions"><button className="primary-button" type="submit">{busy ? "Updating display…" : "Save display preferences"}</button><button className="account-button" type="button" onClick={() => void act("rotate")}>{enabled ? "Regenerate OBS access" : "Generate OBS URL"}</button><button className="account-button" type="button" disabled={!enabled} onClick={() => void act("revoke")}>Revoke access</button></div>
    </fieldset></form>
    {url && <div className="workspace-actions"><a className="account-button" href={url} target="_blank" rel="noopener noreferrer">Preview OBS Display</a><button className="primary-button" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage("OBS Browser Source URL copied."); } catch { setMessage("Clipboard unavailable. Copy the private URL from the field below."); } }}>Copy OBS Browser Source URL</button><label className="workspace-field obs-url">Private Browser Source URL<input readOnly type="password" value={url} autoComplete="off" onFocus={(e) => e.target.select()} /></label></div>}
    <p className="workspace-help">Access: {enabled ? "enabled" : "disabled"}. The URL permits display only; keep it private. After reloading this page, regenerate access to obtain a new URL. Save preferences before previewing. Use 1920 × 1080 in OBS.</p>
    {message && <p role="status">{message}</p>}
  </section>;
}

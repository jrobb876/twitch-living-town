"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredTown } from "@/lib/persistence/types";

type State = { town: StoredTown | null; csrfToken?: string; error?: string; message?: string };
export default function PersistentTown({ onTown }: { onTown: (town: StoredTown | null) => void }) {
  const [state, setState] = useState<State | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const refresh = useCallback(() => {
    if (saving.current) return;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    void fetch("/api/town", { credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data: State = await response.json();
      if (controller.signal.aborted) return;
      setState(data);
      if (response.ok) onTown(data.town);
      else if (response.status === 401) onTown(null);
    }).catch(() => { if (!controller.signal.aborted) setState({ town: null, error: "unavailable", message: "Town storage could not be reached. No save was confirmed. Reload to retry." }); });
  }, [onTown]);
  useEffect(() => {
    void refresh(); window.addEventListener("focus", refresh); window.addEventListener("living-town:reload", refresh);
    return () => { active.current?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("living-town:reload", refresh); };
  }, [refresh]);
  async function save(form: HTMLFormElement) {
    if (!state?.csrfToken || busy) return;
    saving.current = true;
    setBusy(true); setNotice("");
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    const values = new FormData(form), existing = state.town;
    const body = existing ? { townId: existing.world.id, revision: existing.revision, settings: { name: values.get("mayorName") } }
      : { name: values.get("townName"), mayorName: values.get("mayorName") };
    try {
      const response = await fetch("/api/town", { method: existing ? "PATCH" : "POST", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": state.csrfToken }, body: JSON.stringify(body) });
      const data: State = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) { setNotice(data.message ?? "The save could not be confirmed. Reload and retry."); return; }
      setState(data); onTown(data.town); setNotice("Saved to Supabase.");
    } catch { if (!controller.signal.aborted) setNotice("The save could not be confirmed. Reload before retrying; the request may have reached the database."); }
    finally { saving.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="chat-connection" aria-label="Persistent town">
    <div className="chat-connection-title"><strong>Your town</strong><span className="chat-mode">{state?.town ? "SAVED IN SUPABASE" : "DEMO IS SEPARATE"}</span></div>
    {!state ? <p role="status">Checking town storage…</p> : state.error ? <p role="status">{state.message}</p> : <>
      <p>{state.town ? `Saved town: ${state.town.world.name}. Revision ${state.town.revision}. Its layout stays fixed across visits.`
        : "You do not own a town yet. Create one deliberately for your Twitch channel. This creates no follower or subscriber ownership records."}</p>
      <form key={state.town ? `${state.town.world.id}:${state.town.revision}` : "create"} className="chat-actions" onSubmit={(event) => { event.preventDefault(); void save(event.currentTarget); }}>
        {!state.town && <label>Town name <input name="townName" required maxLength={60} defaultValue="Willowbrook" disabled={busy} /></label>}
        <label>Mayor name <input name="mayorName" required maxLength={60} defaultValue={state.town?.world.mayor.name ?? "Mochi"} disabled={busy} /></label>
        <button className="account-button" disabled={busy} type="submit">{busy ? "Saving…" : state.town ? "Save Mayor name" : "Create my town"}</button>
      </form>
    </>}
    <button className="account-button" type="button" disabled={busy} onClick={() => { setNotice(""); void refresh(); }}>Reload saved town</button>
    {notice && <p role="status">{notice}</p>}
    <p className="chat-note">Demo regeneration and simulated events never write to your saved town. Movement and chat activity remain temporary.</p>
  </section>;
}

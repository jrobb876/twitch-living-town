"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredTown } from "@/lib/persistence/types";

type State = { town: StoredTown | null; error?: string; message?: string };
/** The Overview still loads saved worlds; creation and editing live in the owner workspace. */
export default function PersistentTown({ onTown }: { onTown: (town: StoredTown | null) => void }) {
  const [state, setState] = useState<State | null>(null);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    void fetch("/api/town", { credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data: State = await response.json();
      if (controller.signal.aborted) return;
      setState(data);
      if (response.ok) onTown(data.town);
      else if (response.status === 401) onTown(null);
    }).catch(() => { if (!controller.signal.aborted) setState({ town: null, error: "unavailable", message: "Town storage could not be reached. Reload to retry." }); });
  }, [onTown]);
  useEffect(() => {
    refresh(); window.addEventListener("focus", refresh); window.addEventListener("living-town:reload", refresh);
    return () => { active.current?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("living-town:reload", refresh); };
  }, [refresh]);
  return <section className="chat-connection" aria-label="Persistent town">
    <div className="chat-connection-title"><strong>Your town</strong><span className="chat-mode">{state?.town ? "SAVED IN SUPABASE" : "DEMO IS SEPARATE"}</span></div>
    {!state ? <p role="status">Checking your town…</p> : state.error ? <p role="status">{state.message} <Link href="/account">Your Twitch account</Link></p> : <>
      <p>{state.town ? `Saved town: ${state.town.world.name}. Mayor ${state.town.world.mayor.name}. Your homes and streets are kept across visits.` : "A place for your community is waiting. Creating a town is optional; signing in never creates one automatically."}</p>
      <Link className="account-button" href={state.town ? "/dashboard/town" : "/onboarding"}>{state.town ? "Manage My Town" : "Create my town"}</Link>
    </>}
    <button className="account-button" type="button" onClick={refresh}>Reload saved town</button>
    <p className="chat-note">Demo regeneration and simulated events never write to your saved town.</p>
  </section>;
}

"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { StoredTown } from "@/lib/persistence/types";
import { createTownLoader, type TownLoadState } from "@/lib/persistence/town-loader";

/** The Overview still loads saved worlds; creation and editing live in the owner workspace. */
export default function PersistentTown({ onTown, initialTown = null }: { onTown: (town: StoredTown | null) => void; initialTown?: StoredTown | null }) {
  const [initial] = useState(initialTown);
  const [state, setState] = useState<TownLoadState | null>(initial ? { town: initial } : null);
  const [pending, setPending] = useState(true);
  const retry = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    const loader = createTownLoader(setState, onTown, setPending, initial);
    const refresh = () => { void loader.refresh(); };
    retry.current = loader.refresh;
    refresh(); window.addEventListener("focus", refresh); window.addEventListener("living-town:reload", refresh);
    return () => { loader.dispose(); retry.current = null; window.removeEventListener("focus", refresh); window.removeEventListener("living-town:reload", refresh); };
  }, [initial, onTown]);
  return <SavedTownStatus state={state} pending={pending} onRetry={() => { void retry.current?.(); }} />;
}

export function SavedTownStatus({ state, pending, onRetry }: { state: TownLoadState | null; pending: boolean; onRetry: () => void }) {
  return <section className="chat-connection" aria-label="Persistent town">
    <div className="chat-connection-title"><strong>Your town</strong><span className="chat-mode">{state?.town ? "SAVED IN SUPABASE" : "DEMO IS SEPARATE"}</span></div>
    {!state ? <p role="status">Checking your town…</p> : state.error ? <div><p role="alert">{state.message} <Link href="/account">Your Twitch account</Link></p><button className="account-button" type="button" disabled={pending} onClick={onRetry}>{pending ? "Retrying…" : "Retry"}</button></div> : <>
      <p>{state.town ? `Saved town: ${state.town.world.name}. Mayor ${state.town.world.mayor.name}. Your homes and streets are kept across visits.` : "A place for your community is waiting. Creating a town is optional; signing in never creates one automatically."}</p>
    </>}
    {state?.town ? <Link className="account-button" href="/dashboard/town">Manage My Town</Link> : state && !state.error && <Link className="account-button" href="/onboarding">Create my town</Link>}
  </section>;
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StoredTown } from "@/lib/persistence/types";
import { createWorld } from "@/lib/simulation/world";
import { mayorLook, mayorLooks, mayorPalettes, personalities, personalityFor, personalityNames, type MayorLook, type PersonalityName } from "@/lib/mayor/presets";
import TwitchAccount from "./twitch-account";
import ChatConnection from "./chat-connection";
import SubscriberHousing from "./subscriber-housing";
import MayorPortrait from "./mayor-portrait";
import TownPreview from "./town-preview";

type Draft = { name: string; mayorName: string; look: MayorLook; personality: PersonalityName | "existing" };
function MayorFields({ draft, change }: { draft: Draft; change: (patch: Partial<Draft>) => void }) {
  return <>
    <label className="workspace-field">Mayor name<input required maxLength={60} value={draft.mayorName} onChange={(e) => change({ mayorName: e.target.value })} autoComplete="off" /></label>
    <fieldset className="mayor-options"><legend>Choose your cat-like Mayor</legend><div className="mayor-grid">
      {mayorLooks.map((look) => <label className="mayor-option" key={look}><input type="radio" name="mayor-look" value={look} checked={draft.look === look} onChange={() => change({ look })} /><MayorPortrait name={draft.mayorName || "Your Mayor"} preset={look} /><strong>{mayorPalettes[look].label}</strong></label>)}
    </div></fieldset>
    <fieldset className="mayor-options"><legend>A little personality</legend><div className="personality-grid">
      {draft.personality === "existing" && <label className="personality-option"><input type="radio" name="personality" checked readOnly /><strong>Existing personality</strong><span>Your saved curiosity and energy will be kept unless you choose a new personality.</span></label>}
      {personalityNames.map((preset) => <label className="personality-option" key={preset}><input type="radio" name="personality" checked={draft.personality === preset} onChange={() => change({ personality: preset })} /><strong>{personalities[preset].label}</strong><span>{personalities[preset].description}</span></label>)}
    </div></fieldset>
  </>;
}
const noPresentation = () => {};
const noSnapshot = () => {};
const noMode = () => {};

export default function StreamerWorkspace({ initialTown, csrfToken }: { initialTown: StoredTown | null; csrfToken: string }) {
  return <main className="streamer-page"><nav className="houses-nav"><Link href="/">← Town Overview</Link><TwitchAccount /></nav>
    {initialTown ? <Dashboard initialTown={initialTown} csrfToken={csrfToken} /> : <Onboarding csrfToken={csrfToken} />}
  </main>;
}
function Onboarding({ csrfToken }: { csrfToken: string }) {
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>({ name: "Willowbrook", mayorName: "Mochi", look: "cream", personality: "curious" });
  const change = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const preview = useMemo(() => {
    const world = createWorld({ id: "onboarding-preview", streamerTwitchUserId: "preview-only", seed: 42, name: draft.name || "Your town", mayorName: draft.mayorName || "Your Mayor" });
    world.mayor.appearance = { preset: draft.look };
    if (draft.personality !== "existing") world.mayor.personality = personalityFor(draft.personality);
    return world;
  }, [draft]);
  async function next() {
    if (busy) return;
    setError("");
    if (step >= 1 && !draft.name.trim() || step >= 2 && !draft.mayorName.trim()) { setError("Please enter a name with at least one visible character."); return; }
    if (step < 3) { setStep(step + 1); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/town", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ name: draft.name, mayorName: draft.mayorName, mayorAppearance: { preset: draft.look }, mayorPersonality: personalityFor(draft.personality === "existing" ? "curious" : draft.personality) }) });
      const data = await response.json();
      if (!response.ok) { setError(data.message ?? "Your town could not be created. Please retry."); setBusy(false); return; }
      window.location.replace("/dashboard");
    } catch { setError("Creation could not be confirmed. Retrying is safe: you can only have one town."); setBusy(false); }
  }
  return <><div className="eyebrow">A LITTLE PLACE TO BELONG</div><h1>Welcome home.</h1><p className="workspace-intro">Make a place for your community, with one small Mayor to look after it.</p>
    <ol className="wizard-steps" aria-label="Onboarding progress">{["Welcome", "Your town", "Your Mayor", "Review"].map((label, i) => <li key={label} aria-current={step === i ? "step" : undefined}><span>{i + 1}</span>{label}</li>)}</ol>
    <form className="workspace-card" onSubmit={(e) => { e.preventDefault(); void next(); }}>
      <fieldset disabled={busy} className="workspace-form">
        {step === 0 && <><h2>A town that grows with you</h2><p>Your community brings the streets to life. Verified subscribers can receive a permanent home, and new neighborhoods grow as the town fills.</p><div className="welcome-mayor"><MayorPortrait name="Your Mayor" preset={draft.look} /><p>Your cat-like Mayor wanders the streets and welcomes new neighbors. Choose their look and personality next.</p></div><p>Creating a town is your choice. Chat and subscriber connections are optional and can be set up later.</p></>}
        {step === 1 && <><h2>Name your corner of the world</h2><label className="workspace-field">Town name<input required maxLength={60} value={draft.name} onChange={(e) => change({ name: e.target.value })} autoComplete="off" /></label><p>Roads, homes, gardens and room for future neighbors are generated automatically.</p><TownPreview world={preview} /><p className="workspace-help">Sample environment. Your saved town receives its own seed and coordinated planting.</p></>}
        {step === 2 && <><h2>Meet your Mayor</h2><MayorFields draft={draft} change={change} /><p className="workspace-help">Personalities shape walks and quiet pauses. Naps, construction inspections and more expressive animations are future additions.</p></>}
        {step === 3 && <><h2>Ready to open the gates?</h2><div className="welcome-mayor"><MayorPortrait name={draft.mayorName} preset={draft.look} /><dl><dt>Town</dt><dd>{draft.name.trim()}</dd><dt>Mayor</dt><dd>{draft.mayorName.trim()} · {mayorPalettes[draft.look].label}</dd><dt>Personality</dt><dd>{draft.personality !== "existing" ? personalities[draft.personality].label : "Existing"}</dd></dl></div><p>This creates one permanent town for your signed-in Twitch account. You can rename it and change your Mayor later without moving anyone’s home.</p></>}
        <div className="workspace-actions">{step > 0 && <button className="account-button" type="button" onClick={() => { setStep(step - 1); setError(""); }}>Back</button>}<button className="primary-button" type="submit">{busy ? "Opening your town…" : step === 3 ? "Create my town" : "Next"}</button></div>
      </fieldset>
      {error && <p role="alert" className="account-error">{error} <Link href="/account">Check your connection</Link></p>}
    </form></>;
}
function Dashboard({ initialTown, csrfToken }: { initialTown: StoredTown; csrfToken: string }) {
  const [town, setTown] = useState(initialTown), [editor, setEditor] = useState(0), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async (resetEditor = false) => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch("/api/town", { credentials: "same-origin", cache: "no-store", signal: controller.signal }); const data = await response.json();
      if (controller.signal.aborted) return;
      if (response.status === 401) { window.location.replace("/account"); return; }
      if (!response.ok) { setError(data.message ?? "Town status is unavailable."); return; }
      if (!data.town || data.town.world.id !== initialTown.world.id) { window.location.replace("/dashboard"); return; }
      setTown(data.town); setError(""); if (resetEditor) setEditor((n) => n + 1);
    } catch { if (!controller.signal.aborted) setError("Town status could not be refreshed. Your saved town is retained."); }
  }, [initialTown.world.id]);
  useEffect(() => {
    const reload = () => { void refresh(); };
    window.addEventListener("living-town:reload", reload); window.addEventListener("focus", reload);
    const timer = window.setInterval(reload, 20000);
    return () => { request.current?.abort(); clearInterval(timer); window.removeEventListener("living-town:reload", reload); window.removeEventListener("focus", reload); };
  }, [refresh]);
  const { world } = town;
  return <><div className="eyebrow">YOUR STREAMER DASHBOARD</div><h1>{world.name}<span>.</span></h1><p className="workspace-intro">A little care for the place your community calls home.</p>
    <div className="dashboard-stats"><div><strong>{world.residents.length}</strong><span>Residents</span></div><div><strong>{world.residents.filter((r) => r.subscription?.active && r.houseId).length}</strong><span>Active subscriber homes</span></div><div><strong>{world.plots.length}</strong><span>Total plots</span></div></div>
    <div className="workspace-actions"><Link className="account-button" href="/">Open Town Overview</Link><Link className="account-button" href="/my-houses">My Houses</Link><button className="account-button" onClick={() => void refresh()}>Refresh town status</button></div>
    {error && <p role="alert" className="account-error">{error}</p>}
    {notice && <p role="status" className="account-notice">{notice}</p>}
    <div className="dashboard-grid"><TownPreview key={world.id} world={world} /><section className="workspace-card"><h2>Your town & Mayor</h2><TownSettings key={`${world.id}:${editor}`} town={town} csrfToken={csrfToken} onSaved={(saved) => { request.current?.abort(); setTown(saved); setEditor((n) => n + 1); setNotice("Your town and Mayor settings are saved."); }} onReload={() => { setNotice(""); void refresh(true); }} /></section></div>
    <section className="workspace-card"><h2>Bring your community to town</h2><p>These connections are optional. If permission is missing, use the authorization button below. If your Twitch session has expired, <Link href="/account">reconnect your account</Link>, then return here.</p>
      <ChatConnection mode="live" onMode={noMode} onSnapshot={noSnapshot} hasSavedTown showSourceControls={false} />
      <SubscriberHousing onPresentation={noPresentation} />
    </section>
  </>;
}
function TownSettings({ town, csrfToken, onSaved, onReload }: { town: StoredTown; csrfToken: string; onSaved: (town: StoredTown) => void; onReload: () => void }) {
  // Keep the edit base stable during status polls. Conflict recovery is deliberate.
  const [base] = useState(town);
  const [draft, setDraft] = useState<Draft>({ name: base.world.name, mayorName: base.world.mayor.name, look: mayorLook(base.world.mayor.appearance?.preset), personality: base.world.mayor.personality?.preset ?? "existing" });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function save() {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/town/settings", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ townId: base.world.id, revision: base.revision,
        settings: { name: draft.name, mayor: { name: draft.mayorName,
          ...(draft.look !== mayorLook(base.world.mayor.appearance?.preset) ? { appearance: { preset: draft.look } } : {}),
          ...(draft.personality !== "existing" && draft.personality !== base.world.mayor.personality?.preset ? { personality: personalityFor(draft.personality) } : {}) } } }) });
      const data = await response.json();
      if (!response.ok) { setMessage(response.status === 409 ? "Your town changed while you were editing. Your draft is still here. Reload saved settings to discard this draft and try again." : data.message ?? "Settings could not be saved."); return; }
      onSaved(data.town);
    } catch { setMessage("Save could not be confirmed. Reload saved settings before retrying; your request may have reached the town."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={(e) => { e.preventDefault(); void save(); }}><fieldset disabled={busy} className="workspace-form"><label className="workspace-field">Town name<input required maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><MayorFields draft={draft} change={(patch) => setDraft((current) => ({ ...current, ...patch }))} /><div className="workspace-actions"><button type="submit" className="primary-button">{busy ? "Saving…" : "Save settings"}</button><button type="button" className="account-button" onClick={onReload}>Reload saved settings</button></div><p className="workspace-help">Your seed, houses and streets stay exactly where they are. Reload discards unsaved edits.</p></fieldset>{message && <p role="status" className="account-error">{message}</p>}</form>;
}

"use client";

import dynamic from "next/dynamic";

import { useCallback, useEffect, useRef, useState } from "react";
import { createWorld, createSession, giftCount, housesIn, synchronizeWorld } from "@/lib/simulation/world";
import { neighborhoodLabel } from "@/lib/simulation/population";
import { availablePlots } from "@/lib/simulation/expansion";
import { processEvent, tickTown } from "@/lib/simulation/engine";
import type { TownEvent } from "@/lib/simulation/types";
import TownLoading from "./town-loading";
import ChatConnection from "./chat-connection";
import { createLiveView, projectLiveActivity } from "@/lib/chat/projection";
import type { ChatSnapshot } from "@/lib/chat/types";
import type { TownSession } from "@/lib/simulation/types";
import type { StoredTown } from "@/lib/persistence/types";
import PersistentTown from "./persistent-town";
import SubscriberHousing from "./subscriber-housing";
import type { HousingPresentation } from "@/lib/subscribers/types";
import MayorPortrait from "./mayor-portrait";

const EventSimulator = dynamic(() => import("./event-simulator"), { ssr: false });

const TownCanvas = dynamic(() => import("./town-canvas"), { ssr: false, loading: () => <div className="canvas-message"><TownLoading compact /></div> });
const townName = process.env.NEXT_PUBLIC_TOWN_NAME || "Willowbrook";
const mayorName = process.env.NEXT_PUBLIC_MAYOR_NAME || "Mochi";

export default function TownExperience({ enableSimulator = false, initialTown = null }: { enableSimulator?: boolean; initialTown?: StoredTown | null }) {
  const [generation, setGeneration] = useState({ seed: 20261027, revision: 0 });
  const [mode, setMode] = useState<"live" | "simulated">(initialTown ? "live" : "simulated");
  const [savedTown, setSavedTown] = useState<StoredTown | null>(initialTown);
  const selectedTown = useRef<string | null>(initialTown?.world.id ?? null);
  const receiveTown = useCallback((town: StoredTown | null) => {
    setSavedTown(town);
    if (town && selectedTown.current !== town.world.id) setMode("live");
    selectedTown.current = town?.world.id ?? null;
  }, []);
  return <TownSessionView key={`${generation.seed}:${generation.revision}`} seed={generation.seed} enableSimulator={enableSimulator} mode={mode} setMode={setMode}
    savedTown={savedTown} onTown={receiveTown}
    onReset={() => setGeneration((current) => ({ ...current, revision: current.revision + 1 }))}
    onRegenerate={(seed) => setGeneration((current) => ({ seed, revision: current.revision + 1 }))} />;
}

function TownSessionView({ seed, enableSimulator, mode, setMode, onReset, onRegenerate, savedTown, onTown }: { seed: number; enableSimulator: boolean; mode: "live" | "simulated"; setMode: (mode: "live" | "simulated") => void; onReset: () => void; onRegenerate: (seed: number) => void; savedTown: StoredTown | null; onTown: (town: StoredTown | null) => void }) {
  const [demoSession, setSession] = useState(() => createSession(createWorld({ id: "demo-willowbrook", streamerTwitchUserId: "sim-streamer", seed, name: townName, mayorName })));
  const [liveSession, setLiveSession] = useState<TownSession | null>(() => savedTown ? createSession(savedTown.world) : null);
  const receivePresentation = useCallback((presentation: HousingPresentation) => {
    setLiveSession((current) => {
      if (!current || current.world.id !== presentation.townId) return current;
      const now = current.runtime.now;
      return { ...current, runtime: { ...current.runtime,
        effects: [...current.runtime.effects, ...presentation.effects.map((effect) => ({ ...effect, startedAt: now, expiresAt: now + 12000 }))].slice(-32),
        mayor: { ...current.runtime.mayor, behavior: presentation.tasks.length ? "approaching" : current.runtime.mayor.behavior,
          tasks: [...current.runtime.mayor.tasks, ...presentation.tasks.map((task) => ({ ...task, expiresAt: now + (task.nodeId.startsWith("neighborhood-") ? 600000 : 120000) }))].slice(-16) } } };
    });
  }, []);
  const receiveSnapshot = useCallback((snapshot: ChatSnapshot | null) => {
    if (!snapshot) { setLiveSession((current) => savedTown ? current ? synchronizeWorld(current, savedTown.world) : createSession(savedTown.world) : null); if (!savedTown) setMode("simulated"); return; }
    const saved = savedTown?.world.streamerTwitchUserId === snapshot.channel.twitchUserId ? savedTown.world : undefined;
    const target = saved?.id ?? snapshot.townId;
    setLiveSession((current) => {
      const state = current?.world.id === target ? (saved ? synchronizeWorld(current, saved) : current)
        : createLiveView(snapshot, seed, townName, mayorName, current?.runtime.now ?? 0, saved);
      return projectLiveActivity(state, { ...snapshot, townId: target });
    });
  }, [seed, setMode, savedTown]);
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now() - start;
      setSession((current) => tickTown(current, now));
      setLiveSession((current) => current ? tickTown(current, now) : null);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  function sendEvent(event: TownEvent) { setSession((current) => processEvent(current, event).state); }
  const session = mode === "live" && liveSession ? liveSession : demoSession;
  const { world, runtime } = session;
  const persistentView = mode === "live" && world.id === savedTown?.world.id;
  const mayorStatus = { idle: "Enjoying a peaceful moment", wandering: "On a little neighborhood stroll", approaching: "On the way to welcome a neighbor", celebrating: "Celebrating with a neighbor!", welcoming: "Welcoming visitors at Town Hall!" }[runtime.mayor.behavior];
  function regenerate() {
    if (process.env.NODE_ENV !== "development" || !enableSimulator || mode !== "simulated") return;
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    onRegenerate(value === seed ? (seed + 1) >>> 0 : value);
  }
  return (
    <div className="app-shell">
      <main>
        <section className="town-heading" aria-labelledby="town-title">
          <div><div className="eyebrow">A COMMUNITY IN BLOOM <span>✿</span></div><h1 id="town-title">Welcome to {world.name}<span>.</span></h1><p>A cozy little world. A place for everyone. One very small Mayor.</p></div>
        </section>
        <PersistentTown onTown={onTown} initialTown={savedTown} />
        <SubscriberHousing key={savedTown?.world.id ?? "no-saved-town"} onPresentation={receivePresentation} />
        <ChatConnection mode={mode} onMode={setMode} onSnapshot={receiveSnapshot} hasSavedTown={!!savedTown} showSourceControls={enableSimulator} />
        <section className="town-layout" aria-label="Village prototype">
          <div className="village-frame">
            <div className="map-topline"><span className="map-badge"><span className="green-dot" />{world.name} <span className="badge-divider">/</span> Town view</span><span className="weather"><span>☀</span> A lovely day to wander</span></div>
            <TownCanvas key={session.world.id} session={session} />
            {runtime.effects.length > 0 && <div className="town-announcement" role="status">{runtime.effects.findLast((e) => e.kind === "neighborhood")?.label ?? runtime.effects.at(-1)!.label}{runtime.effects.some((e) => e.kind === "neighborhood") && " Use Fit town (0) to explore."}</div>}
            <div className="map-bottomline"><span><i className="map-dot" />Procedurally grown, with love</span><span>Drag to explore <b>·</b> Scroll to zoom</span></div>
          </div>
          <aside className="town-sidebar">
            <section className="mayor-card">
              <div className="card-eyebrow">MEET YOUR MAYOR <span>✧</span></div>
              <div className="mayor-portrait"><MayorPortrait name={world.mayor.name} preset={world.mayor.appearance?.preset} /></div>
              <h2>{world.mayor.name}<span className="mayor-badge">MAYOR</span></h2>
              <p>Small paws. Big responsibilities.</p>
              <div className="mayor-status"><span className="green-dot" />{mayorStatus}</div>
              <div className="mayor-note">“Just checking that everyone has a nice sunny spot.”<span>— The Mayor’s daily agenda</span></div>
            </section>
            <section className="neighborhood-card">
              <div className="card-eyebrow">OUR LITTLE NEIGHBORHOOD</div>
              <div className="stats-row"><span className="stat-icon">⌂</span><div><strong>{housesIn(world).length}</strong><span>Cozy homes</span></div><span className="stat-note">{world.residents.filter((r) => r.houseId).length} subscriber owned</span></div>
              <div className="neighborhood-detail"><span>Residents / subscribers</span><strong>{world.residents.length} / {world.residents.filter((r) => r.isSubscriber).length}</strong></div>
              <div className="neighborhood-detail"><span>Community gifts</span><strong>{giftCount(world)}</strong></div>
              <div className="neighborhood-detail"><strong>{neighborhoodLabel(world)}</strong><span>{world.plots.length} total plots</span></div>
              <div className="neighborhood-detail"><span>Available housing</span><strong>{availablePlots(world)}</strong></div>
              <div className="neighborhood-detail"><span>Chat activity</span><strong>{runtime.activity.level} · {runtime.activity.score}/100</strong></div>
              <meter className="activity-meter" aria-label="Community chat activity" min={0} max={100} value={runtime.activity.score} />
              {world.residents.some((r) => r.housingStatus === "waiting") && <p className="housing-note">All plots allocated. {world.residents.filter((r) => r.housingStatus === "waiting").length} subscriber(s) awaiting expansion.</p>}
              <div className="neighborhood-detail"><span>Town heart</span><strong>Willow Green</strong></div>
              <div className="neighborhood-detail"><span>Headquarters</span><strong>Town Hall</strong></div>
              <div className="seed-display"><span>WORLD SEED</span><code aria-live="polite">{world.seed}</code></div>
            </section>
            <section className="future-note"><span aria-hidden="true">✿</span><div><h3>A town that grows with you</h3><p>Today, a first village. Soon, a home for your Twitch community.</p><span className="local-label">{persistentView ? "PERSISTENT TOWN · LIVE CHAT SOURCE" : mode === "live" ? "LIVE CHAT PREVIEW · NOT SAVED" : "SIMULATED DEMO · LOCAL EVENTS"}</span></div></section>
          </aside>
        </section>
        {process.env.NODE_ENV === "development" && enableSimulator && mode === "simulated" && <details className="event-simulator"><summary>Development tools · simulated town</summary><p>Generate a new local demo layout. This does not save or change your community’s town.</p><button className="account-button" type="button" onClick={regenerate}>Regenerate demo town</button></details>}
        {enableSimulator && mode === "simulated" && <EventSimulator state={demoSession} onEvent={sendEvent} onReset={onReset} />}
        <footer className="page-footer"><span><span className="footer-leaf">❧</span> Every community deserves a place to call home.</span><span>Twitch Living Town <b>/</b> Foundation & first village</span></footer>
      </main>
    </div>
  );
}

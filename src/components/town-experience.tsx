"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createWorld, createSession, giftCount, housesIn } from "@/lib/simulation/world";
import { processEvent, tickTown } from "@/lib/simulation/engine";
import type { TownEvent } from "@/lib/simulation/types";
import TwitchAccount from "./twitch-account";
import ChatConnection from "./chat-connection";
import { createLiveView, projectLiveActivity } from "@/lib/chat/projection";
import type { ChatSnapshot } from "@/lib/chat/types";
import type { TownSession } from "@/lib/simulation/types";

const EventSimulator = dynamic(() => import("./event-simulator"), { ssr: false });

const TownCanvas = dynamic(() => import("./town-canvas"), { ssr: false, loading: () => <div className="canvas-message">Opening the village gates…</div> });
const townName = process.env.NEXT_PUBLIC_TOWN_NAME || "Willowbrook";
const mayorName = process.env.NEXT_PUBLIC_MAYOR_NAME || "Mochi";

function CatPortrait() {
  return <svg viewBox="0 0 100 100" role="img" aria-label={`${mayorName}, a cream-colored cat wearing a green neckerchief`}>
    <circle cx="50" cy="50" r="49" fill="#e9eddb" />
    <path d="M69 75Q94 72 83 52" fill="none" stroke="#e6c697" strokeWidth="9" strokeLinecap="round" />
    <ellipse cx="49" cy="76" rx="23" ry="20" fill="#efd1a1" />
    <path d="M24 43 23 16 43 29M75 43 77 16 58 29" fill="#f7dfb7" stroke="#e5c79a" strokeWidth="2" />
    <path d="m29 32-1-10 10 10m31 0 3-10-10 10" fill="#dda7a0" />
    <ellipse cx="50" cy="47" rx="30" ry="25" fill="#ffe8c5" />
    <ellipse cx="32" cy="51" rx="6" ry="3" fill="#ebbbb0" /><ellipse cx="68" cy="51" rx="6" ry="3" fill="#ebbbb0" />
    <path d="M36 44q3-4 6 0m16 0q3-4 6 0" fill="none" stroke="#455e4d" strokeWidth="3" strokeLinecap="round" />
    <path d="m47 50 6 0-3 4Z" fill="#b98e7c" /><path d="M43 57q7 6 14 0" fill="none" stroke="#a17e68" strokeWidth="2" strokeLinecap="round" />
    <path d="m26 52-12-3m60 3 12-3" stroke="#c3a584" strokeWidth="2" />
    <path d="M31 69q19 9 38 0l-4 10-12-2-1 15-12-13-9-2Z" fill="#72988a" /><circle cx="49" cy="76" r="4" fill="#f3cc7d" />
  </svg>;
}

export default function TownExperience({ enableSimulator = false }: { enableSimulator?: boolean }) {
  const [generation, setGeneration] = useState({ seed: 20261027, revision: 0 });
  const [mode, setMode] = useState<"live" | "simulated">("simulated");
  return <TownSessionView key={`${generation.seed}:${generation.revision}`} seed={generation.seed} enableSimulator={enableSimulator} mode={mode} setMode={setMode}
    onReset={() => setGeneration((current) => ({ ...current, revision: current.revision + 1 }))}
    onRegenerate={(seed) => setGeneration((current) => ({ seed, revision: current.revision + 1 }))} />;
}

function TownSessionView({ seed, enableSimulator, mode, setMode, onReset, onRegenerate }: { seed: number; enableSimulator: boolean; mode: "live" | "simulated"; setMode: (mode: "live" | "simulated") => void; onReset: () => void; onRegenerate: (seed: number) => void }) {
  const [demoSession, setSession] = useState(() => createSession(createWorld({ id: "demo-willowbrook", streamerTwitchUserId: "sim-streamer", seed, name: townName, mayorName })));
  const [liveSession, setLiveSession] = useState<TownSession | null>(null);
  const receiveSnapshot = useCallback((snapshot: ChatSnapshot | null) => {
    if (!snapshot) { setLiveSession(null); setMode("simulated"); return; }
    setLiveSession((current) => projectLiveActivity(current?.world.id === snapshot.townId ? current
      : createLiveView(snapshot, seed, townName, mayorName, 0), snapshot));
  }, [seed, setMode]);
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
  const mayorStatus = { idle: "Enjoying a peaceful moment", wandering: "On a little neighborhood stroll", approaching: "On the way to welcome a neighbor", celebrating: "Celebrating with a neighbor!", welcoming: "Welcoming visitors at Town Hall!" }[runtime.mayor.behavior];
  function regenerate() {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    onRegenerate(value === seed ? (seed + 1) >>> 0 : value);
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Twitch Living Town home"><span className="brand-mark">⌂<i>✦</i></span><span>living town<span className="brand-subtitle">A LITTLE PLACE TO BELONG</span></span></Link>
        <TwitchAccount />
        <span className="prototype-tag">TWITCHCON HACKATHON <span>·</span> TOWN OVERVIEW</span>
      </header>
      <main>
        <section className="town-heading" aria-labelledby="town-title">
          <div><div className="eyebrow">A COMMUNITY IN BLOOM <span>✿</span></div><h1 id="town-title">Welcome to {townName}<span>.</span></h1><p>A cozy little world. A place for everyone. One very small Mayor.</p></div>
          <button className="primary-button regenerate" onClick={regenerate}><span aria-hidden="true">⟳</span> Regenerate town</button>
        </section>
        <ChatConnection mode={mode} onMode={setMode} onSnapshot={receiveSnapshot} />
        <section className="town-layout" aria-label="Village prototype">
          <div className="village-frame">
            <div className="map-topline"><span className="map-badge"><span className="green-dot" />{townName} <span className="badge-divider">/</span> Town view</span><span className="weather"><span>☀</span> A lovely day to wander</span></div>
            <TownCanvas key={session.world.id} session={session} />
            {runtime.effects.length > 0 && <div className="town-announcement" role="status">{runtime.effects.at(-1)!.label}</div>}
            <div className="map-bottomline"><span><i className="map-dot" />Procedurally grown, with love</span><span>Drag to explore <b>·</b> Scroll to zoom</span></div>
          </div>
          <aside className="town-sidebar">
            <section className="mayor-card">
              <div className="card-eyebrow">MEET YOUR MAYOR <span>✧</span></div>
              <div className="mayor-portrait"><CatPortrait /></div>
              <h2>{mayorName}<span className="mayor-badge">MAYOR</span></h2>
              <p>Small paws. Big responsibilities.</p>
              <div className="mayor-status"><span className="green-dot" />{mayorStatus}</div>
              <div className="mayor-note">“Just checking that everyone has a nice sunny spot.”<span>— The Mayor’s daily agenda</span></div>
            </section>
            <section className="neighborhood-card">
              <div className="card-eyebrow">OUR LITTLE NEIGHBORHOOD</div>
              <div className="stats-row"><span className="stat-icon">⌂</span><div><strong>{housesIn(world).length}</strong><span>Cozy homes</span></div><span className="stat-note">{world.residents.filter((r) => r.houseId).length} subscriber owned</span></div>
              <div className="neighborhood-detail"><span>Residents / subscribers</span><strong>{world.residents.length} / {world.residents.filter((r) => r.isSubscriber).length}</strong></div>
              <div className="neighborhood-detail"><span>Community gifts</span><strong>{giftCount(world)}</strong></div>
              <div className="neighborhood-detail"><span>Chat activity</span><strong>{runtime.activity.level} · {runtime.activity.score}/100</strong></div>
              <meter className="activity-meter" aria-label="Community chat activity" min={0} max={100} value={runtime.activity.score} />
              {world.residents.some((r) => r.housingStatus === "waiting") && <p className="housing-note">All plots allocated. {world.residents.filter((r) => r.housingStatus === "waiting").length} subscriber(s) awaiting expansion.</p>}
              <div className="neighborhood-detail"><span>Town heart</span><strong>Willow Green</strong></div>
              <div className="neighborhood-detail"><span>Headquarters</span><strong>Town Hall</strong></div>
              <div className="seed-display"><span>WORLD SEED</span><code aria-live="polite">{seed}</code></div>
            </section>
            <section className="future-note"><span aria-hidden="true">✿</span><div><h3>A town that grows with you</h3><p>Today, a first village. Soon, a home for your Twitch community.</p><span className="local-label">{mode === "live" ? "LIVE CHAT SOURCE · TOWN IN MEMORY" : "SIMULATED TOWN · LOCAL EVENTS"}</span></div></section>
          </aside>
        </section>
        {enableSimulator && mode === "simulated" && <EventSimulator state={demoSession} onEvent={sendEvent} onReset={onReset} />}
        <footer className="page-footer"><span><span className="footer-leaf">❧</span> Every community deserves a place to call home.</span><span>Twitch Living Town <b>/</b> Foundation & first village</span></footer>
      </main>
    </div>
  );
}

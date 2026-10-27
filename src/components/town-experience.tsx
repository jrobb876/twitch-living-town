"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { generateTown } from "@/lib/town/generate";

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

export default function TownExperience() {
  const [seed, setSeed] = useState(20261027);
  const town = useMemo(() => generateTown(seed), [seed]);
  function regenerate() {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    setSeed((previous) => value === previous ? (previous + 1) >>> 0 : value);
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Twitch Living Town home"><span className="brand-mark">⌂<i>✦</i></span><span>living town<span className="brand-subtitle">A LITTLE PLACE TO BELONG</span></span></Link>
        <div className="header-center"><span className="green-dot" />Your community, a little closer.</div>
        <span className="prototype-tag">TWITCHCON HACKATHON <span>·</span> PROTOTYPE 01</span>
      </header>
      <main>
        <section className="town-heading" aria-labelledby="town-title">
          <div><div className="eyebrow">A COMMUNITY IN BLOOM <span>✿</span></div><h1 id="town-title">Welcome to {townName}<span>.</span></h1><p>A cozy little world. A place for everyone. One very small Mayor.</p></div>
          <button className="primary-button regenerate" onClick={regenerate}><span aria-hidden="true">⟳</span> Regenerate town</button>
        </section>
        <section className="town-layout" aria-label="Village prototype">
          <div className="village-frame">
            <div className="map-topline"><span className="map-badge"><span className="green-dot" />{townName} <span className="badge-divider">/</span> Town view</span><span className="weather"><span>☀</span> A lovely day to wander</span></div>
            <TownCanvas key={seed} town={town} mayorName={mayorName} />
            <div className="map-bottomline"><span><i className="map-dot" />Procedurally grown, with love</span><span>Drag to explore <b>·</b> Scroll to zoom</span></div>
          </div>
          <aside className="town-sidebar">
            <section className="mayor-card">
              <div className="card-eyebrow">MEET YOUR MAYOR <span>✧</span></div>
              <div className="mayor-portrait"><CatPortrait /></div>
              <h2>{mayorName}<span className="mayor-badge">MAYOR</span></h2>
              <p>Small paws. Big responsibilities.</p>
              <div className="mayor-status"><span className="green-dot" />On a little neighborhood stroll</div>
              <div className="mayor-note">“Just checking that everyone has a nice sunny spot.”<span>— The Mayor’s daily agenda</span></div>
            </section>
            <section className="neighborhood-card">
              <div className="card-eyebrow">OUR LITTLE NEIGHBORHOOD</div>
              <div className="stats-row"><span className="stat-icon">⌂</span><div><strong>{town.houses.length}</strong><span>Cozy homes</span></div><span className="stat-note">& room to grow</span></div>
              <div className="neighborhood-detail"><span>Town heart</span><strong>Willow Green</strong></div>
              <div className="neighborhood-detail"><span>Headquarters</span><strong>Town Hall</strong></div>
              <div className="seed-display"><span>WORLD SEED</span><code aria-live="polite">{seed}</code></div>
            </section>
            <section className="future-note"><span aria-hidden="true">✿</span><div><h3>A town that grows with you</h3><p>Today, a first village. Soon, a home for your Twitch community.</p><span className="local-label">LOCAL DEMO · TWITCH NOT CONNECTED</span></div></section>
          </aside>
        </section>
        <footer className="page-footer"><span><span className="footer-leaf">❧</span> Every community deserves a place to call home.</span><span>Twitch Living Town <b>/</b> Foundation & first village</span></footer>
      </main>
    </div>
  );
}

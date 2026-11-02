"use client";
import TownLoading from "./town-loading";

import { useEffect, useRef, useState } from "react";
import type { TownSession } from "@/lib/simulation/types";
import { housesIn } from "@/lib/simulation/world";
import type { TownRenderer } from "@/lib/rendering/create-renderer";

export type HouseFocusRequest = { houseId: string; sequence: number };
export default function TownCanvas({ session, focusRequest }: { session: TownSession; focusRequest?: HouseFocusRequest }) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<TownRenderer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [focusError, setFocusError] = useState("");
  const [initial] = useState(session);
  const latest = useRef(session);
  const focusHouseId = focusRequest?.houseId, focusSequence = focusRequest?.sequence;
  useEffect(() => { latest.current = session; renderer.current?.update(session); }, [session]);
  useEffect(() => {
    if (!focusHouseId || focusSequence === undefined || status !== "ready") return;
    const found = renderer.current?.focusHouse(focusHouseId);
    setFocusError(found ? "" : "Your house could not be located in this town. Try reloading the saved house.");
    if (found) host.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [focusHouseId, focusSequence, status]);
  useEffect(() => {
    const controller = new AbortController();
    let owned: TownRenderer | null = null;
    async function start() {
      try {
        const { createTownRenderer } = await import("@/lib/rendering/create-renderer");
        if (controller.signal.aborted || !host.current) return;
        owned = await createTownRenderer(host.current, initial, controller.signal);
        if (controller.signal.aborted) { owned?.destroy(); return; }
        renderer.current = owned; owned?.update(latest.current); setStatus("ready");
      } catch (error) {
        if (!controller.signal.aborted) { console.error("Town renderer failed:", error); setStatus("error"); }
      }
    }
    void start();
    return () => { controller.abort(); owned?.destroy(); renderer.current = null; };
  }, [initial, attempt]);
  return (
    <>
      <div ref={host} className="canvas-host" tabIndex={0} role="region" aria-label={`${housesIn(session.world).length} home village. Drag to pan, scroll to zoom. Keyboard: arrow keys to pan, plus or minus to zoom, zero to fit.`} />
      {focusError && <p className="canvas-message" role="alert">{focusError}</p>}
      {status === "loading" && <div className="canvas-message"><TownLoading compact /></div>}
      {status === "error" && <div className="canvas-message" role="alert"><strong>The village couldn’t open.</strong><p>A browser with WebGL and hardware acceleration is needed.</p><button className="primary-button" onClick={() => { setStatus("loading"); setAttempt((n) => n + 1); }}>Try again</button></div>}
      <div className="camera-controls" aria-label="Camera controls">
        <button title="Zoom in (+)" aria-label="Zoom in" disabled={status !== "ready"} onClick={() => renderer.current?.zoom(1.2)}>+</button>
        <button title="Zoom out (-)" aria-label="Zoom out" disabled={status !== "ready"} onClick={() => renderer.current?.zoom(1 / 1.2)}>−</button>
        <span />
        <button title="Fit town (0)" aria-label="Fit entire town" disabled={status !== "ready"} onClick={() => renderer.current?.reset()}>⌗</button>
      </div>
      <div className="pan-controls" aria-label="Pan camera">
        <button aria-label="Pan up" onClick={() => renderer.current?.pan(0, 60)}>↑</button>
        <button aria-label="Pan left" onClick={() => renderer.current?.pan(60, 0)}>←</button>
        <button aria-label="Pan down" onClick={() => renderer.current?.pan(0, -60)}>↓</button>
        <button aria-label="Pan right" onClick={() => renderer.current?.pan(-60, 0)}>→</button>
      </div>
    </>
  );
}

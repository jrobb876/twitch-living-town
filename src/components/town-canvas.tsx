"use client";

import { useEffect, useRef, useState } from "react";
import type { Town } from "@/lib/town/types";
import type { TownRenderer } from "@/lib/rendering/create-renderer";

export default function TownCanvas({ town, mayorName }: { town: Town; mayorName: string }) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<TownRenderer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let owned: TownRenderer | null = null;
    async function start() {
      try {
        const { createTownRenderer } = await import("@/lib/rendering/create-renderer");
        if (controller.signal.aborted || !host.current) return;
        owned = await createTownRenderer(host.current, town, mayorName, controller.signal);
        if (controller.signal.aborted) { owned?.destroy(); return; }
        renderer.current = owned; setStatus("ready");
      } catch (error) {
        if (!controller.signal.aborted) { console.error("Town renderer failed:", error); setStatus("error"); }
      }
    }
    void start();
    return () => { controller.abort(); owned?.destroy(); renderer.current = null; };
  }, [town, mayorName, attempt]);
  return (
    <>
      <div ref={host} className="canvas-host" tabIndex={0} role="region" aria-label={`${town.houses.length} home village. Drag to pan, scroll to zoom. Keyboard: arrow keys to pan, plus or minus to zoom, zero to fit.`} />
      {status === "loading" && <div className="canvas-message" role="status"><span className="loading-sprout">✿</span>Growing your little corner of the world…</div>}
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

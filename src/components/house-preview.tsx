"use client";
import { useEffect, useRef, useState } from "react";
import type { HouseBuilding } from "@/lib/simulation/types";
import { houseVisual } from "@/lib/houses/customization";

export default function HousePreview({ house }: { house: HouseBuilding }) {
  const host = useRef<HTMLDivElement>(null), latest = useRef(house), redraw = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => { latest.current = house; redraw.current?.(); }, [house]);
  useEffect(() => {
    let cancelled = false, dispose: (() => void) | undefined;
    async function start() {
      const [{ Application }, { houseView }] = await Promise.all([import("pixi.js"), import("@/lib/rendering/draw-town")]);
      if (cancelled || !host.current) return;
      const element = host.current, app = new Application();
      try { await app.init({ width: element.clientWidth || 420, height: 350, preference: "webgl", background: 0xe5ecd9, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2) }); }
      catch (error) { try { app.destroy(true, { children: true }); } catch { /* Initialization may be incomplete. */ } throw error; }
      if (cancelled) { app.destroy(true, { children: true }); return; }
      try {
        element.appendChild(app.canvas); app.canvas.setAttribute("aria-hidden", "true");
        const draw = () => {
          app.stage.removeChildren().forEach((item) => item.destroy({ children: true }));
          const visual = houseView({ ...houseVisual(latest.current), x: 0, y: 0 });
          visual.position.set(app.screen.width / 2, 165); visual.scale.set(Math.min(app.screen.width / 270, 1.4));
          app.stage.addChild(visual);
        };
        const observer = new ResizeObserver(() => { app.renderer.resize(element.clientWidth || 420, 350); draw(); });
        let destroyed = false;
        dispose = () => { if (destroyed) return; destroyed = true; observer.disconnect(); redraw.current = null; app.destroy(true, { children: true }); };
        redraw.current = draw; draw(); observer.observe(element); setStatus("ready");
      } catch (error) { if (dispose) dispose(); else app.destroy(true, { children: true }); throw error; }
    }
    void start().catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return <div className="house-preview" role="img" aria-label={`House preview: ${houseVisual(house).name || "Cozy cottage"}`}>
    <div ref={host} />{status === "loading" && <p role="status">Preparing your cottage preview…</p>}{status === "error" && <p role="status">Preview unavailable. Enable WebGL and reload; your saved house is unchanged.</p>}
  </div>;
}

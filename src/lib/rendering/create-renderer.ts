import { Application, Text } from "pixi.js";
import { seededRandom } from "../town/generate";
import type { Town } from "../town/types";
import { drawMayor, drawTown } from "./draw-town";

export type TownRenderer = {
  zoom: (factor: number) => void;
  pan: (dx: number, dy: number) => void;
  reset: () => void;
  destroy: () => void;
};

/** Browser-only owner of GPU resources, ticker, camera and native listeners. */
export async function createTownRenderer(host: HTMLElement, town: Town, mayorName: string, signal: AbortSignal): Promise<TownRenderer | null> {
  const app = new Application();
  await app.init({
    width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight),
    background: 0xe3ebd9, antialias: true, autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2), preference: "webgl",
  });
  // React Strict Mode or regeneration can dispose the effect while init awaits.
  if (signal.aborted) { app.destroy(true, { children: true }); return null; }
  let destroyed = false;
  let observer: ResizeObserver | undefined;
  const cleanup: (() => void)[] = [];
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    observer?.disconnect();
    cleanup.forEach((remove) => remove());
    app.destroy(true, { children: true });
  };
  try {
    host.appendChild(app.canvas);
    app.canvas.setAttribute("aria-hidden", "true");
    const { world, actors } = drawTown(town); app.stage.addChild(world);
    const { mayor, body, tail } = drawMayor(); actors.addChild(mayor);
    const badge = new Text({ text: mayorName, style: { fontFamily: "Arial", fontWeight: "600", fontSize: 11, fill: 0x405e4a } });
    badge.anchor.set(0.5); badge.y = -66; mayor.addChild(badge);
    const random = seededRandom(town.seed ^ 0xcafe);
    const nodes = new Map(town.navigation.map((node) => [node.id, node]));
    let current = nodes.get("1-2")!;
    let previous = "";
    let target = current;
    let rest = 1.5;
    let elapsed = 0;
    mayor.position.set(current.x, current.y);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    app.ticker.maxFPS = 60;
    app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, 0.05); elapsed += dt;
      if (reducedMotion) return;
      let walking = false;
      if (rest > 0) {
        rest -= dt;
        if (rest <= 0) {
          const choices = current.neighbors.filter((id) => id !== previous);
          target = nodes.get((choices.length ? choices : current.neighbors)[Math.floor(random() * (choices.length || current.neighbors.length))])!;
        }
      } else {
        const dx = target.x - mayor.x, dy = target.y - mayor.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 36 * dt) {
          mayor.position.set(target.x, target.y); previous = current.id; current = target;
          rest = current.id.startsWith("home") || current.id === "hall" ? 2 + random() * 3 : 0.2 + random();
        } else {
          walking = true; mayor.x += (dx / distance) * 36 * dt; mayor.y += (dy / distance) * 36 * dt;
          if (Math.abs(dx) > 1) body.scale.x = dx > 0 ? 1 : -1;
        }
      }
      mayor.zIndex = mayor.y;
      body.y = Math.sin(elapsed * (walking ? 12 : 2.5)) * (walking ? 2 : 0.8);
      body.rotation = walking ? Math.sin(elapsed * 12) * 0.035 : 0;
      tail.rotation = Math.sin(elapsed * 2) * 0.1;
    });
    let fit = 1;
    const clampCamera = () => {
      const s = world.scale.x;
      world.x = Math.max(80 - town.width * s, Math.min(app.screen.width - 80, world.x));
      world.y = Math.max(80 - town.height * s, Math.min(app.screen.height - 80, world.y));
    };
    const reset = () => {
      fit = Math.min(app.screen.width / town.width, app.screen.height / town.height) * 0.96;
      world.scale.set(fit);
      world.position.set((app.screen.width - town.width * fit) / 2, (app.screen.height - town.height * fit) / 2);
    };
    const zoomAt = (factor: number, x: number, y: number) => {
      const old = world.scale.x;
      const next = Math.max(fit * 0.7, Math.min(fit * 3.5, old * factor));
      world.position.set(x - (x - world.x) * next / old, y - (y - world.y) * next / old);
      world.scale.set(next); clampCamera();
    };
    const zoom = (factor: number) => zoomAt(factor, app.screen.width / 2, app.screen.height / 2);
    const pan = (dx: number, dy: number) => { world.x += dx; world.y += dy; clampCamera(); };
    reset();
    observer = new ResizeObserver(() => {
      if (destroyed) return;
      const oldFit = fit;
      const oldWidth = app.screen.width, oldHeight = app.screen.height;
      const centerX = (oldWidth / 2 - world.x) / world.scale.x;
      const centerY = (oldHeight / 2 - world.y) / world.scale.x;
      app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
      fit = Math.min(app.screen.width / town.width, app.screen.height / town.height) * 0.96;
      world.scale.set(world.scale.x * fit / oldFit);
      world.position.set(app.screen.width / 2 - centerX * world.scale.x, app.screen.height / 2 - centerY * world.scale.x);
      clampCamera();
    });
    observer.observe(host);
    const canvas = app.canvas;
    let drag: { id: number; x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || drag) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId); canvas.style.cursor = "grabbing";
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      pan(event.clientX - drag.x, event.clientY - drag.y);
      drag.x = event.clientX; drag.y = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      drag = null; canvas.style.cursor = "grab";
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - bounds.left, event.clientY - bounds.top);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.target !== host) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => pan(45, 0), ArrowRight: () => pan(-45, 0),
        ArrowUp: () => pan(0, 45), ArrowDown: () => pan(0, -45),
        "+": () => zoom(1.2), "=": () => zoom(1.2), "-": () => zoom(1 / 1.2), "0": reset,
      };
      if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
    };
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("lostpointercapture", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });
    host.addEventListener("keydown", keyboard);
    cleanup.push(() => {
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("lostpointercapture", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      host.removeEventListener("keydown", keyboard);
    });
    return { zoom, pan, reset, destroy };
  } catch (error) { destroy(); throw error; }
}

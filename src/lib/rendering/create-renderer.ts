import { Application, Container, Graphics, Text } from "pixi.js";
import type { TownSession } from "../simulation/types";
import { overviewOf } from "./overview";
import { drawMayor, drawTown } from "./draw-town";

export type TownRenderer = {
  update: (session: TownSession) => void;
  zoom: (factor: number) => void;
  pan: (dx: number, dy: number) => void;
  reset: () => void;
  destroy: () => void;
};

/** Browser-only owner of GPU resources, ticker, camera and native listeners. */
export async function createTownRenderer(host: HTMLElement, initial: TownSession, signal: AbortSignal): Promise<TownRenderer | null> {
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
    let snapshot = initial;
    const town = initial.world.layout;
    const world = new Container(); app.stage.addChild(world);
    let scene = drawTown(overviewOf(initial.world)); world.addChild(scene.world);
    let actors = scene.actors;
    const { mayor, body, tail } = drawMayor(); actors.addChild(mayor);
    const badge = new Text({ text: initial.world.mayor.name, style: { fontFamily: "Arial", fontWeight: "600", fontSize: 11, fill: 0x405e4a } });
    badge.anchor.set(0.5); badge.y = -66; mayor.addChild(badge);
    let elapsed = 0;
    mayor.position.set(initial.runtime.mayor.position.x, initial.runtime.mayor.position.y);
    const residents = new Map<string, Graphics>();
    const effectsLayer = new Container(); world.addChild(effectsLayer);
    const effects = new Map<string, Container>();
    const update = (next: TownSession) => {
      if (destroyed) return;
      if (next.world.buildings !== snapshot.world.buildings) {
        mayor.removeFromParent(); residents.forEach((actor) => actor.removeFromParent());
        scene.world.destroy({ children: true });
        scene = drawTown(overviewOf(next.world)); actors = scene.actors;
        world.addChildAt(scene.world, 0); actors.addChild(mayor);
        residents.forEach((actor) => actors.addChild(actor));
      }
      for (const { residentId, actor } of next.runtime.residentActors) {
        if (!residents.has(residentId)) {
          const person = new Graphics().ellipse(0, 2, 7, 3).fill({ color: 0x48664c, alpha: 0.15 })
            .roundRect(-5, -12, 10, 13, 4).fill([0xa286ac, 0x729baf, 0xc89678][residents.size % 3])
            .circle(0, -17, 5).fill(0xf3d6b0);
          person.position.set(actor.position.x, actor.position.y); actors.addChild(person); residents.set(residentId, person);
        }
      }
      for (const [id, visual] of effects) if (!next.runtime.effects.some((effect) => effect.id === id)) { visual.destroy({ children: true }); effects.delete(id); }
      for (const effect of next.runtime.effects) if (!effects.has(effect.id)) {
        const visual = new Container(); visual.position.set(effect.position.x, effect.position.y - 85);
        const text = new Text({ text: effect.label, style: { fontFamily: "Arial", fontSize: 13, fontWeight: "600", fill: 0x425e4d, wordWrap: true, wordWrapWidth: 210, align: "center" } });
        text.anchor.set(0.5);
        const backing = new Graphics().roundRect(-text.width / 2 - 12, -text.height / 2 - 9, text.width + 24, text.height + 18, 8).fill(0xfff6dc).stroke({ color: 0xc3b48f, width: 1 });
        for (let i = 0; i < 8; i++) backing.circle(-50 + i * 15, -28 - (i % 3) * 8, 3).fill([0xe5b093, 0xa0b875, 0xb3a2c6][i % 3]);
        visual.addChild(backing, text); effectsLayer.addChild(visual); effects.set(effect.id, visual);
      }
      snapshot = next;
    };
    update(initial);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    app.ticker.maxFPS = 60;
    app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, 0.05); elapsed += dt;
      if (reducedMotion) return;
      const state = snapshot.runtime.mayor;
      const walking = state.targetNodeId !== null;
      const blend = Math.min(1, dt * 15);
      const dx = state.position.x - mayor.x;
      mayor.x += dx * blend; mayor.y += (state.position.y - mayor.y) * blend;
      if (Math.abs(dx) > 0.2) body.scale.x = dx > 0 ? 1 : -1;
      mayor.zIndex = mayor.y;
      const celebrating = state.behavior === "celebrating" || state.behavior === "welcoming";
      body.y = celebrating ? -Math.abs(Math.sin(elapsed * 8)) * 6 : Math.sin(elapsed * (walking ? 12 : 2.5)) * (walking ? 2 : 0.8);
      body.rotation = walking ? Math.sin(elapsed * 12) * 0.035 : 0;
      tail.rotation = Math.sin(elapsed * 2) * 0.1;
      for (const { residentId, actor } of snapshot.runtime.residentActors) {
        const visual = residents.get(residentId)!;
        visual.x += (actor.position.x - visual.x) * blend;
        visual.y += (actor.position.y - visual.y) * blend;
        visual.zIndex = visual.y;
      }
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
    return { update, zoom, pan, reset, destroy };
  } catch (error) { destroy(); throw error; }
}

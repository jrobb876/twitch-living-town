import { Application, Container, Graphics, Text } from "pixi.js";
import type { TownSession } from "../simulation/types";
import { overviewOf } from "./overview";
import { drawMayor, drawTown } from "./draw-town";
import { clampCameraPosition, fitCamera, coverCamera, worldBounds, followCamera, smoothCamera } from "./camera";
import { rendererViewport } from "./viewport";
import { residentVisible } from "./resident-visibility";
import { spotlightComposition, type DisplaySettings } from "../overlay/model";

export type TownRenderer = {
  update: (session: TownSession) => void;
  zoom: (factor: number) => void;
  pan: (dx: number, dy: number) => void;
  reset: () => void;
  destroy: () => void;
  setDisplay: (settings: DisplaySettings) => void;
  focusEvent: (position: { x: number; y: number }, seconds: number) => void;
};

/** Browser-only owner of GPU resources, ticker, camera and native listeners. */
export async function createTownRenderer(host: HTMLElement, initial: TownSession, signal: AbortSignal, display?: DisplaySettings): Promise<TownRenderer | null> {
  const app = new Application();
  await app.init({
    ...rendererViewport(host, window.devicePixelRatio),
    background: 0xe3ebd9, backgroundAlpha: display ? 0 : 1, antialias: true, autoDensity: true,
    preference: "webgl",
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
    let bounds = worldBounds(initial.world);
    let fit = 1;
    const geometryKey = (session: TownSession) => JSON.stringify([session.world.layout, session.world.districts,
      session.world.plots.filter((p) => p.districtId === "expansion").map((p) => p.buildingId)]);
    let geometry = geometryKey(initial);
    const backdrop = display ? new Graphics() : null;
    if (backdrop) app.stage.addChild(backdrop);
    const world = new Container(); app.stage.addChild(world);
    let foreground = display ? drawMayor(initial.world.mayor.appearance?.preset) : null;
    if (foreground) app.stage.addChild(foreground.mayor);
    let focus: { x: number; y: number; until: number } | null = null;
    let scene = drawTown(overviewOf(initial.world)); world.addChild(scene.world);
    let actors = scene.actors;
    let { mayor, body, tail } = drawMayor(initial.world.mayor.appearance?.preset); actors.addChild(mayor);
    const badge = new Text({ text: initial.world.mayor.name, style: { fontFamily: "Arial", fontWeight: "600", fontSize: 11, fill: 0x405e4a } });
    badge.anchor.set(0.5); badge.y = -66; mayor.addChild(badge);
    let elapsed = 0;
    mayor.position.set(initial.runtime.mayor.position.x, initial.runtime.mayor.position.y);
    const residents = new Map<string, Graphics>();
    const effectsLayer = new Container(); world.addChild(effectsLayer);
    const effects = new Map<string, Container>();
    const cull = () => scene.cull({ x: -world.x / world.scale.x, y: -world.y / world.scale.x,
      width: app.screen.width / world.scale.x, height: app.screen.height / world.scale.x });
    const update = (next: TownSession) => {
      if (destroyed) return;
      if (next.world.mayor.appearance?.preset !== snapshot.world.mayor.appearance?.preset) {
        const previous = mayor; badge.removeFromParent();
        ({ mayor, body, tail } = drawMayor(next.world.mayor.appearance?.preset));
        mayor.position.copyFrom(previous.position); mayor.addChild(badge); actors.addChild(mayor);
        previous.destroy({ children: true });
        if (foreground) {
          foreground.mayor.destroy({ children: true }); foreground = drawMayor(next.world.mayor.appearance?.preset);
          app.stage.addChild(foreground.mayor);
        }
      }
      badge.text = next.world.mayor.name;
      const changed = next.world.layout !== snapshot.world.layout || next.world.plots !== snapshot.world.plots;
      const nextGeometry = changed ? geometryKey(next) : geometry;
      if (nextGeometry !== geometry) {
        mayor.removeFromParent(); residents.forEach((actor) => actor.removeFromParent());
        scene.world.destroy({ children: true });
        scene = drawTown(overviewOf(next.world)); actors = scene.actors;
        world.addChildAt(scene.world, 0); actors.addChild(mayor);
        residents.forEach((actor) => actors.addChild(actor));
        geometry = nextGeometry; bounds = worldBounds(next.world);
        fit = fitCamera(bounds, app.screen.width, app.screen.height).scale;
      } else if (next.world.buildings !== snapshot.world.buildings) {
        const town = overviewOf(next.world);
        scene.syncHouses(town.houses); scene.syncLots(town.expansion);
      }
      if (changed || next.world.buildings !== snapshot.world.buildings) cull();
      const visibleResidents = new Set(next.runtime.residentActors.map((actor) => actor.residentId));
      for (const [id, visual] of residents) if (!visibleResidents.has(id)) { visual.destroy(); residents.delete(id); }
      for (const { residentId, actor } of next.runtime.residentActors) {
        if (!residents.has(residentId)) {
          const person = new Graphics().ellipse(0, 2, 7, 3).fill({ color: 0x48664c, alpha: 0.15 })
            .roundRect(-5, -12, 10, 13, 4).fill([0xa286ac, 0x729baf, 0xc89678][residents.size % 3])
            .circle(0, -17, 5).fill(0xf3d6b0);
          person.position.set(actor.position.x, actor.position.y); actors.addChild(person); residents.set(residentId, person);
          person.visible = false; person.alpha = 0;
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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    app.ticker.maxFPS = 60;
    app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, 0.05); elapsed += dt;
      const state = snapshot.runtime.mayor;
      const walking = state.targetNodeId !== null;
      const blend = reducedMotion ? 1 : Math.min(1, dt * 15);
      const dx = state.position.x - mayor.x;
      mayor.x += dx * blend; mayor.y += (state.position.y - mayor.y) * blend;
      if (Math.abs(dx) > 0.2) body.scale.x = dx > 0 ? 1 : -1;
      mayor.zIndex = mayor.y;
      const celebrating = state.behavior === "celebrating" || state.behavior === "welcoming";
      body.y = reducedMotion ? 0 : celebrating ? -Math.abs(Math.sin(elapsed * 8)) * 6 : Math.sin(elapsed * (walking ? 12 : 2.5)) * (walking ? 2 : 0.8);
      body.rotation = !reducedMotion && walking ? Math.sin(elapsed * 12) * 0.035 : 0;
      tail.rotation = reducedMotion ? 0 : Math.sin(elapsed * 2) * 0.1;
      if (display && foreground) {
        const composition = spotlightComposition(app.screen.width, app.screen.height, display);
        foreground.mayor.visible = composition.visible;
        foreground.mayor.position.set(composition.x, composition.y); foreground.mayor.scale.set(composition.scale);
        // One Mayor model/runtime, two views. Personality modulates the existing idle motion.
        const energy = snapshot.world.mayor.personality?.energy ?? 0.5;
        foreground.body.y = reducedMotion ? 0 : celebrating ? -Math.abs(Math.sin(elapsed * 8)) * 3 : Math.sin(elapsed * (1.5 + energy)) * 0.8;
        foreground.tail.rotation = reducedMotion ? 0 : Math.sin(elapsed * (1 + energy)) * 0.1;
        if (display.mode === "living-town") {
          if (focus && focus.until <= elapsed) focus = null;
          const camera = followCamera(bounds, app.screen.width, app.screen.height, focus ?? mayor);
          const position = reducedMotion ? camera : smoothCamera(world.position, camera, dt);
          world.scale.set(camera.scale); world.position.set(position.x, position.y); cull();
        }
      }
      const viewport = { x: -world.x / world.scale.x, y: -world.y / world.scale.y,
        width: app.screen.width / world.scale.x, height: app.screen.height / world.scale.y };
      for (const { residentId, actor } of snapshot.runtime.residentActors) {
        const visual = residents.get(residentId)!;
        const visible = residentVisible(actor.position, viewport, world.scale.x, visual.visible, world.visible);
        if (!visible) { visual.visible = false; visual.alpha = 0; continue; }
        if (!visual.visible) { visual.position.set(actor.position.x, actor.position.y); visual.visible = true; }
        visual.alpha = reducedMotion ? 1 : Math.min(1, visual.alpha + dt * 8);
        visual.x += (actor.position.x - visual.x) * blend;
        visual.y += (actor.position.y - visual.y) * blend;
        visual.zIndex = visual.y;
      }
    });
    const clampCamera = () => {
      const position = clampCameraPosition(bounds, app.screen.width, app.screen.height, world.scale.x, world.x, world.y);
      world.position.set(position.x, position.y); cull();
    };
    const reset = () => {
      const camera = display?.mode === "living-town" ? followCamera(bounds, app.screen.width, app.screen.height, snapshot.runtime.mayor.position)
        : display ? coverCamera(bounds, app.screen.width, app.screen.height) : fitCamera(bounds, app.screen.width, app.screen.height); fit = camera.scale;
      world.scale.set(fit);
      world.position.set(camera.x, camera.y); cull();
      if (display && foreground && backdrop) {
        const composition = spotlightComposition(app.screen.width, app.screen.height, display);
        world.visible = composition.showTown; backdrop.visible = composition.showTown;
        backdrop.clear().rect(0, 0, app.screen.width, app.screen.height).fill(0xe3ebd9);
        foreground.mayor.visible = composition.visible;
        foreground.mayor.position.set(composition.x, composition.y); foreground.mayor.scale.set(composition.scale);
      }
    };
    const zoomAt = (factor: number, x: number, y: number) => {
      const old = world.scale.x;
      const next = Math.max(fit * 0.7, Math.min(Math.max(3.5, fit * 3.5), old * factor));
      world.position.set(x - (x - world.x) * next / old, y - (y - world.y) * next / old);
      world.scale.set(next); clampCamera();
    };
    const zoom = (factor: number) => zoomAt(factor, app.screen.width / 2, app.screen.height / 2);
    const pan = (dx: number, dy: number) => { world.x += dx; world.y += dy; clampCamera(); };
    reset();
    update(initial);
    const resize = () => {
      if (destroyed) return;
      if (display) {
        const viewport = rendererViewport(host, window.devicePixelRatio);
        if (viewport.width === app.screen.width && viewport.height === app.screen.height && viewport.resolution === app.renderer.resolution) return;
        app.renderer.resize(viewport.width, viewport.height, viewport.resolution);
        reset(); return;
      }
      const oldFit = fit;
      const oldWidth = app.screen.width, oldHeight = app.screen.height;
      const centerX = (oldWidth / 2 - world.x) / world.scale.x;
      const centerY = (oldHeight / 2 - world.y) / world.scale.x;
      app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
      fit = fitCamera(bounds, app.screen.width, app.screen.height).scale;
      world.scale.set(world.scale.x * fit / oldFit);
      world.position.set(app.screen.width / 2 - centerX * world.scale.x, app.screen.height / 2 - centerY * world.scale.x);
      clampCamera();
    };
    observer = new ResizeObserver(resize);
    observer.observe(host);
    if (display) {
      // Also catch a display-density change when CSS dimensions stay unchanged.
      window.addEventListener("resize", resize);
      cleanup.push(() => window.removeEventListener("resize", resize));
    }
    const canvas = app.canvas;
    let drag: { id: number; x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (display || event.button !== 0 || drag) return;
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
      if (display) return;
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - bounds.left, event.clientY - bounds.top);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (display || event.target !== host) return;
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
    return { update: (next) => {
      const previousGeometry = geometry; update(next);
      if (display?.mode === "spotlight" && previousGeometry !== geometry) reset();
    }, zoom, pan, reset, destroy,
      setDisplay: (settings) => { if (display && JSON.stringify(display) !== JSON.stringify(settings)) { display = settings; reset(); } },
      focusEvent: (position, seconds) => { if (display && Number.isFinite(position.x) && Number.isFinite(position.y)) focus = { ...position, until: elapsed + Math.max(0, Math.min(8, seconds)) }; },
    };
  } catch (error) { destroy(); throw error; }
}

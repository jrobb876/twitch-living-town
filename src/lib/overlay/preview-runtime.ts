import type { TownRenderer } from "../rendering/create-renderer";
import type { TownSession, TownWorld } from "../simulation/types";
import { createSession } from "../simulation/world";
import { tickTown } from "../simulation/engine";
import type { DisplaySettings } from "./model";
import { PREVIEW_ID, PREVIEW_RESET_PATH } from "./preview";
import { reactionLabels } from "../mayor/reactions";
export const previewReactions = ["subscriber", "resubscription", "gift-recipient", "gift", "follower"] as const;

type Factory = (state: TownSession, signal: AbortSignal, display: DisplaySettings) => Promise<TownRenderer | null>;
/** Owns only the demo scene. Injectable timer/factory allow lifecycle tests without a browser. */
export function startPreview(world: TownWorld, initial: DisplaySettings, factory: Factory,
  repeat: (tick: () => void) => () => void = (tick) => { const timer = setInterval(tick, 100); return () => clearInterval(timer); }, now = Date.now) {
  if (world.id !== PREVIEW_ID) throw new Error("Preview world required");
  const life = new AbortController();
  let session = createSession(world, now()), renderer: TownRenderer | null = null, stop: (() => void) | undefined, display = initial;
  let sequence = 0;
  // Begin in an expanded neighborhood; subsequent movement uses the normal Mayor behavior.
  const node = world.layout.navigation.find((n) => n.id === "neighborhood-1:road:1-2");
  if (node) session.runtime.mayor = { ...session.runtime.mayor, nodeId: node.id, position: { x: node.x, y: node.y } };
  const ready = (async () => {
    const created = await factory(session, life.signal, display);
    if (life.signal.aborted) { created?.destroy(); return; }
    if (!created) throw new Error("Preview renderer unavailable");
    renderer = created; renderer.setDisplay(display);
    stop = repeat(() => { if (!life.signal.aborted) { session = tickTown(session, now()); renderer?.update(session); } });
  })();
  const destroy = () => { if (life.signal.aborted) return; life.abort(); stop?.(); renderer?.destroy(); renderer = null; };
  return { ready, destroy, reset: () => { destroy(); return PREVIEW_RESET_PATH; },
    react: (kind: typeof previewReactions[number]) => {
      if (life.signal.aborted || !previewReactions.includes(kind)) return;
      const at = now();
      session = { ...session, runtime: { ...session.runtime, effects: [...session.runtime.effects, {
        id: `demo-reaction:${++sequence}`, kind: "gift" as const, position: { ...session.runtime.mayor.position }, label: reactionLabels[kind],
        startedAt: at, expiresAt: at + 12000, reaction: { kind, ...(kind === "gift" ? { quantity: 5 } : {}) },
      }].slice(-32) } };
    },
    setDisplay: (next: DisplaySettings) => { display = next; renderer?.setDisplay(next); },
    zoom: (factor: number) => renderer?.zoom(factor), pan: (x: number, y: number) => renderer?.pan(x, y), recenter: () => renderer?.reset() };
}

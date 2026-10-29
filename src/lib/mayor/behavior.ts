import { seededRandom } from "../town/generate";
import type { MayorState, TownWorld } from "../simulation/types";

/** Called only when an autonomous walk can start; event tasks always take priority. */
export function mayorStroll(mayor: MayorState, world: TownWorld): string | undefined {
  const preset = world.mayor.personality?.preset;
  if (!preset) return undefined; // Legacy numeric configurations keep their established behavior.
  const random = seededRandom(world.seed ^ 0x9ca7 ^ Math.imul(mayor.steps + 1, 7919));
  const roll = random();
  if (preset === "playful" && roll < 0.65) return mayor.nodeId === "1-2" ? undefined : "1-2";
  if (preset === "calm" && roll < 0.4) return mayor.nodeId === "hall" ? undefined : "hall";
  if (preset === "mischievous" && roll < 0.65 && mayor.previousNodeId) return mayor.previousNodeId;
  if (preset === "curious" && roll < 0.85 || preset === "mischievous" && roll < 0.9) {
    // Nearby doorsteps keep autonomous visits achievable even in large towns.
    const plots = world.plots.filter((p) => p.entranceNodeId !== mayor.nodeId && Math.hypot(p.position.x - mayor.position.x, p.position.y - mayor.position.y) < 700);
    return plots[Math.floor(random() * plots.length)]?.entranceNodeId;
  }
  return undefined;
}
export function mayorPause(world: TownWorld, base: number) {
  const preset = world.mayor.personality?.preset;
  return base * (preset === "calm" ? 3.5 : preset === "playful" ? 0.55 : preset === "mischievous" ? 0.75 : 1);
}

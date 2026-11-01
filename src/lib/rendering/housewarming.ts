import type { TownEffect, TownWorld } from "../simulation/types";

export const HOUSEWARMING_MS = 5000;
export const MAX_HOUSEWARMINGS = 4;

/** A concurrent, bounded display rather than a backlog of bulk-import animations. */
export function housewarmingTargets(world: TownWorld, effects: TownEffect[], now: number) {
  const seen = new Set<string>();
  return effects.filter((effect) => {
    const id = effect.housewarming?.houseId;
    if (!id || seen.has(id) || now < effect.startedAt || now >= Math.min(effect.expiresAt, effect.startedAt + HOUSEWARMING_MS)) return false;
    seen.add(id); return true;
  }).slice(-MAX_HOUSEWARMINGS).flatMap((effect) => {
    const house = world.buildings.find((building) => building.kind === "house" && building.id === effect.housewarming!.houseId);
    return house ? [{ id: effect.id, position: house.position, startedAt: effect.startedAt,
      label: `New home for ${Array.from(effect.housewarming!.displayName).slice(0, 32).join("")}!` }] : [];
  });
}

export function housewarmingPose(age: number, reducedMotion: boolean, spotlight: boolean, scale: number) {
  const alpha = Math.max(0, Math.min(1, age / 250, (HOUSEWARMING_MS - age) / 900));
  return { alpha, lift: reducedMotion ? 0 : -Math.sin(Math.max(0, age) / 800) * 2,
    sparkleAlpha: reducedMotion ? 0.7 : 0.65 + Math.sin(age / 260) * 0.25,
    showLabel: !spotlight && scale >= 0.45 };
}

/** Only public visual metadata crosses the OBS read boundary; no membership record. */
export function housewarmingCues(effects: TownEffect[], deliveryId: string, expiresAt: number): TownEffect[] {
  return effects.filter((effect) => effect.housewarming).map((effect) => ({
    id: `${deliveryId}:home:${effect.id}`, kind: "housewarming", housewarming: { ...effect.housewarming! },
    position: { ...effect.position }, label: "New home!", reaction: null, startedAt: 0, expiresAt,
  }));
}

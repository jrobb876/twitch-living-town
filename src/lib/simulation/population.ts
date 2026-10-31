import type { TownWorld } from "./types";

/** Presentation grouping only: the original technical districts form one settlement. */
export function neighborhoodCount(world: Pick<TownWorld, "districts">) {
  return 1 + world.districts.filter((district) => district.generation).length;
}

export function neighborhoodLabel(world: Pick<TownWorld, "districts">) {
  const count = neighborhoodCount(world);
  return `${count} ${count === 1 ? "Neighborhood" : "Neighborhoods"}`;
}

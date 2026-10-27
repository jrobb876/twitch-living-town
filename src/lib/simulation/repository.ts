import type { TownWorld } from "./types";

/** Replace this boundary with transactional PostgreSQL persistence later. */
export interface TownRepository {
  load(townId: string): TownWorld | null;
  save(world: TownWorld): void;
}

export class InMemoryTownRepository implements TownRepository {
  private towns = new Map<string, TownWorld>();
  load(townId: string) { const world = this.towns.get(townId); return world ? structuredClone(world) : null; }
  save(world: TownWorld) { this.towns.set(world.id, structuredClone(world)); }
}

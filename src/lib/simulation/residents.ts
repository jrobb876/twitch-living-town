import type { TownSession, TownWorld } from "./types";

// One actor per recorded resident through 256; larger populations use a district-balanced sample.
export const MAX_RESIDENT_ACTORS = 256;
type ResidentActors = TownSession["runtime"]["residentActors"];
export type ResidentSource = { id: string; nodeId: string; districtId: string; established?: boolean };

function identityHash(seed: number, id: string) {
  for (const char of id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  return seed;
}

/** Build once per world change. Preserve record order below the bound; above it,
 * round-robin populated districts so later neighborhoods are represented too. */
export function residentSources(world: TownWorld): ResidentSource[] {
  const plots = new Map(world.plots.filter((p) => p.buildingId).map((p) => [p.buildingId!, p]));
  const occupied = new Set(world.residents.flatMap((r) => r.houseId && plots.has(r.houseId) ? [plots.get(r.houseId)!.districtId] : []));
  const fallback = world.plots.filter((p) => occupied.size ? occupied.has(p.districtId) : !!p.buildingId);
  const seen = new Set<string>(), sources: ResidentSource[] = [];
  for (const resident of world.residents) {
    if (seen.has(resident.id)) continue;
    seen.add(resident.id);
    const hash = identityHash(world.seed, resident.id);
    const plot = (resident.houseId && plots.get(resident.houseId)) || fallback[hash % fallback.length];
    sources.push({ id: resident.id, nodeId: plot?.entranceNodeId ?? "1-2", districtId: plot?.districtId ?? "civic", ...(resident.established ? { established: true } : {}) });
  }
  if (sources.length <= MAX_RESIDENT_ACTORS) return sources;
  const groups = new Map<string, ResidentSource[]>();
  for (const source of sources) {
    const group = groups.get(source.districtId) ?? [];
    group.push(source); groups.set(source.districtId, group);
  }
  const selected: ResidentSource[] = [];
  for (let index = 0; selected.length < MAX_RESIDENT_ACTORS; index++) {
    for (const group of groups.values()) {
      if (group[index]) selected.push(group[index]);
      if (selected.length === MAX_RESIDENT_ACTORS) break;
    }
  }
  return selected;
}

/** Also used with opaque OBS sources; sources describe visual actors, never new residents. */
export function reconcileResidentSources(world: TownWorld, now: number, sources: ResidentSource[], actors: ResidentActors = [], known?: Set<string>): ResidentActors {
  const existing = new Map(actors.map((actor) => [actor.residentId, actor]));
  const nodes = new Map(world.layout.navigation.map((node) => [node.id, node]));
  const seen = new Set<string>(), result: ResidentActors = [];
  for (const source of sources) {
    if (seen.has(source.id) || !nodes.has(source.nodeId)) continue;
    seen.add(source.id);
    const retained = existing.get(source.id);
    if (retained && nodes.has(retained.actor.nodeId) && (!retained.actor.targetNodeId || nodes.has(retained.actor.targetNodeId))) result.push(retained);
    else {
      const node = known && !known.has(source.id) && !source.established ? nodes.get("hall")! : nodes.get(source.nodeId)!;
      result.push({ residentId: source.id, actor: { position: { x: node.x, y: node.y }, nodeId: node.id,
        targetNodeId: null, previousNodeId: null, restUntil: now, steps: identityHash(world.seed, source.id) } });
    }
    if (result.length === MAX_RESIDENT_ACTORS) break;
  }
  return result.length === actors.length && result.every((actor, i) => actor === actors[i]) ? actors : result;
}

/** Run on world synchronization, never per frame. No effects or durable mutations. */
export function reconcileResidents(world: TownWorld, now: number, actors: ResidentActors = [], previous?: TownWorld): ResidentActors {
  const sameTown = previous?.id === world.id && previous.streamerTwitchUserId === world.streamerTwitchUserId;
  return reconcileResidentSources(world, now, residentSources(world), sameTown ? actors : [],
    sameTown ? new Set(previous.residents.map((resident) => resident.id)) : undefined);
}

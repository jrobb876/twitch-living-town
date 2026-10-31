import { generateTown, seededRandom } from "../town/generate";
import type { House } from "../town/types";
import type { HouseAppearance, HouseBuilding, TownSession, TownWorld } from "./types";
import { reconcileResidents } from "./residents";

export function appearanceFromHouse(house: House): HouseAppearance {
  return { roofColor: house.roof, wallColor: house.wall, flowerColor: house.flowers,
    architecture: (["cottage", "simple", "dormer"] as const)[house.style], decorations: [] };
}
export function createWorld(input: { id: string; streamerTwitchUserId: string; seed: number; name: string; mayorName: string }): TownWorld {
  const { houses, expansion, ...layout } = generateTown(input.seed);
  const plots = houses.map((house, index) => ({
    id: `plot-${index + 1}`, districtId: `block-${Math.floor(index / 4)}-${index % 4 < 2 ? "west" : "east"}`,
    position: { x: house.x, y: house.y }, entranceNodeId: house.id, buildingId: house.id as string | null,
  }));
  expansion.forEach((position, index) => {
    const id = `expansion-${index + 1}`;
    // The expansion entrance connects from the street to the side of the home.
    // Existing houses, roads and node positions never change on subscription.
    const roadNode = { id: `${id}-road`, x: position.x, y: 880, neighbors: [`${id}-corner`, index === 0 ? "2-1" : "2-3"] };
    const cornerNode = { id: `${id}-corner`, x: position.x - 115, y: 880, neighbors: [roadNode.id, `${id}-side`] };
    const sideNode = { id: `${id}-side`, x: position.x - 115, y: position.y + 48, neighbors: [cornerNode.id, id] };
    layout.navigation.find((node) => node.id === roadNode.neighbors[1])!.neighbors.push(roadNode.id);
    layout.navigation.push(roadNode, cornerNode, sideNode, { id, x: position.x, y: position.y + 48, neighbors: [sideNode.id] });
    plots.push({ id: `plot-${id}`, districtId: "expansion", position, entranceNodeId: id, buildingId: null });
  });
  const districtIds = [...new Set(plots.map((plot) => plot.districtId))];
  return {
    schemaVersion: 1, generatorVersion: 1, id: input.id, streamerTwitchUserId: input.streamerTwitchUserId,
    name: input.name, seed: input.seed >>> 0, layout,
    districts: [{ id: "civic", name: "Willow Green", kind: "civic", plotIds: [] }, ...districtIds.map((id) => ({ id, name: id === "expansion" ? "New beginnings" : id, kind: "residential" as const, plotIds: plots.filter((plot) => plot.districtId === id).map((plot) => plot.id) }))],
    plots, buildings: [
      { id: "town-hall", kind: "town-hall", position: { ...layout.hall } },
      ...houses.map((house, index): HouseBuilding => ({ id: house.id, kind: "house", plotId: plots[index].id,
        position: { x: house.x, y: house.y }, ownerTwitchUserId: null, appearance: appearanceFromHouse(house) })),
    ], residents: [], mayor: { id: `${input.id}:mayor`, name: input.mayorName, species: "cat", headquartersId: "town-hall" },
    processedEvents: [], giftGroups: [],
  };
}

export function createSession(world: TownWorld, now = 0): TownSession {
  const node = world.layout.navigation.find((node) => node.id === "1-2")!;
  return { world, runtime: {
    now, activity: { samples: [], score: 0, level: "peaceful" }, effects: [],
    residentActors: reconcileResidents(world, now),
    mayor: { position: { x: node.x, y: node.y }, nodeId: node.id, targetNodeId: null, previousNodeId: null,
      restUntil: now + 1500, steps: 0, behavior: "idle", tasks: [], celebrationUntil: 0 },
  } };
}

/** Install a confirmed world while retaining animation state only within the same town. */
export function synchronizeWorld(state: TownSession, world: TownWorld): TownSession {
  if (state.world === world) return state;
  if (state.world.id !== world.id || state.world.streamerTwitchUserId !== world.streamerTwitchUserId) return createSession(world, state.runtime.now);
  const residentActors = reconcileResidents(world, state.runtime.now, state.runtime.residentActors, state.world);
  return { world, runtime: residentActors === state.runtime.residentActors ? state.runtime : { ...state.runtime, residentActors } };
}

export function newHouseAppearance(seed: number, plotIndex: number): HouseAppearance {
  const random = seededRandom(seed ^ (plotIndex * 7919));
  return { roofColor: [0xc57965, 0x688e98, 0x889a6b, 0xb98b63, 0x9585a7][Math.floor(random() * 5)],
    wallColor: 0xffedcd, flowerColor: 0xe9a6ac,
    architecture: (["cottage", "simple", "dormer"] as const)[Math.floor(random() * 3)], decorations: [] };
}

export function housesIn(world: TownWorld): HouseBuilding[] {
  return world.buildings.filter((building): building is HouseBuilding => building.kind === "house");
}

export function giftCount(world: TownWorld) {
  return world.giftGroups.reduce((sum, group) => sum + Math.max(group.announcedCount, group.recipientIds.length), 0);
}

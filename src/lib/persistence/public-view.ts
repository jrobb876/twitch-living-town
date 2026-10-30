import type { TownPersistenceService } from "./service";
import type { TownWorld } from "../simulation/types";

export type PublicTownView = Awaited<ReturnType<TownPersistenceService["publicTown"]>>;
/** Adapt only the existing public projection for the renderer; never load a private world here. */
export function publicVisitWorld(view: PublicTownView): TownWorld {
  return {
    schemaVersion: 1, generatorVersion: view.generatorVersion, id: view.id, streamerTwitchUserId: "public-view",
    name: view.name, seed: view.seed, layout: view.layout, districts: view.districts, plots: view.plots,
    mayor: { ...view.mayor, id: `${view.id}:mayor`, headquartersId: view.buildings.find((b) => b.kind === "town-hall")?.id ?? "town-hall" },
    buildings: view.buildings.map((b) => b.kind === "town-hall" ? b : {
      id: b.id, kind: b.kind, plotId: b.plotId, position: b.position, appearance: b.appearance, ownerTwitchUserId: null,
      property: { size: "small", prestige: 0, status: "unclaimed", customization: {
        ...(b.exterior.name !== undefined ? { houseName: b.exterior.name } : {}),
        ...(b.exterior.door !== undefined ? { doorColor: b.exterior.door } : {}),
        ...(b.exterior.fence !== undefined ? { fenceColor: b.exterior.fence } : {}),
        ...(b.exterior.garden !== undefined ? { garden: b.exterior.garden } : {}),
        ...(b.exterior.accent !== undefined ? { accent: b.exterior.accent } : {}),
      } },
    }),
    residents: [], processedEvents: [], giftGroups: [],
  };
}

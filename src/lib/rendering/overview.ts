import type { Town } from "../town/types";
import type { TownWorld } from "../simulation/types";
import { housesIn } from "../simulation/world";

/** Compatibility projection: the original overview retains its visual vocabulary.
 * Coordinates are world units; only the camera converts them to screen pixels.
 */
export function overviewOf(world: TownWorld): Town {
  const roads = [...world.layout.roads];
  const builtExpansion = world.plots.filter((plot) => plot.districtId === "expansion" && plot.buildingId);
  for (const plot of builtExpansion) {
    const ids = [`${plot.entranceNodeId}-road`, `${plot.entranceNodeId}-corner`, `${plot.entranceNodeId}-side`, plot.entranceNodeId];
    for (let index = 1; index < ids.length; index++) {
      const from = world.layout.navigation.find((node) => node.id === ids[index - 1])!;
      const to = world.layout.navigation.find((node) => node.id === ids[index])!;
      roads.push({ from, to, width: 16 });
    }
  }
  return { ...world.layout, roads,
    trees: world.layout.trees.filter((tree) => !builtExpansion.some((plot) => Math.abs(tree.x - plot.position.x) < 110 && Math.abs(tree.y - plot.position.y) < 105)),
    houses: housesIn(world).map((house) => ({ id: house.id, ...house.position,
      roof: house.appearance.roofColor, wall: house.appearance.wallColor, flowers: house.appearance.flowerColor,
      style: ["cottage", "simple", "dormer"].indexOf(house.appearance.architecture) })),
    expansion: world.plots.filter((plot) => plot.districtId === "expansion" && !plot.buildingId).map((plot) => plot.position),
  };
}

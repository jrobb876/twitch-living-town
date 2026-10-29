import { seededRandom } from "../town/generate";
import { PLANNING } from "../town/planning";
import type { TownWorld } from "./types";

export function availablePlots(world: TownWorld) {
  const unclaimed = new Set(world.buildings.flatMap((b) => b.kind === "house" && b.ownerTwitchUserId === null ? [b.id] : []));
  return world.plots.filter((p) => !p.buildingId || unclaimed.has(p.buildingId)).length;
}
/** Square spiral: consecutive cells share an edge; core remains at (0,0). */
export function districtCell(index: number) {
  let x = 0, y = 0, step = 0, length = 1, direction = 0;
  const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  while (step < index) {
    for (let twice = 0; twice < 2 && step < index; twice++, direction++) {
      for (let i = 0; i < length && step < index; i++, step++) { x += directions[direction % 4][0]; y += directions[direction % 4][1]; }
    }
    length++;
  }
  return { x, y };
}
/** Atomic pure planning: do not mutate input, including if a safety check fails. */
export function addDistrict(input: TownWorld): TownWorld | null {
  const index = input.districts.filter((d) => d.generation).length + 1;
  if (index > PLANNING.maxDistricts) return null;
  const id = `neighborhood-${index}`, cell = districtCell(index), previous = districtCell(index - 1);
  if (input.districts.some((d) => d.id === id)) throw new Error("District identity collision");
  const x = cell.x * PLANNING.tileWidth, y = cell.y * PLANNING.tileHeight;
  const seed = (input.seed ^ Math.imul(index, 0x9e3779b1)) >>> 0, random = seededRandom(seed);
  const world = { ...input, layout: structuredClone(input.layout), districts: [...input.districts], plots: [...input.plots] };
  const district: TownWorld["districts"][number] = { id, name: `Neighborhood ${index}`, kind: "residential", plotIds: [],
    generation: { version: PLANNING.version, index, seed, x, y, width: PLANNING.tileWidth, height: PLANNING.tileHeight } };
  const nav = world.layout.navigation, roads = world.layout.roads, xs = [260, 500, 800, 1100, 1340], ys = [380, 630, 880];
  const nodeId = (row: number, col: number) => `${id}:road:${row}-${col}`;
  for (let row = 0; row < 3; row++) {
    roads.push({ from: { x: x + 145, y: y + ys[row] }, to: { x: x + 1455, y: y + ys[row] }, width: 34 });
    for (let col = 0; col < 5; col++) nav.push({ id: nodeId(row, col), x: x + xs[col], y: y + ys[row], neighbors: [
      ...(col ? [nodeId(row, col - 1)] : []), ...(col < 4 ? [nodeId(row, col + 1)] : []),
      ...(col === 2 && row ? [nodeId(row - 1, col)] : []), ...(col === 2 && row < 2 ? [nodeId(row + 1, col)] : []),
    ] });
  }
  roads.push({ from: { x: x + 800, y: y + 380 }, to: { x: x + 800, y: y + 880 }, width: 48 });
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    if (district.plotIds.length >= PLANNING.districtCapacity) continue;
    const position = { x: x + [260, 500, 1100, 1340][col], y: y + [280, 530, 780][row] };
    if (input.plots.some((p) => Math.abs(p.position.x - position.x) < 220 && Math.abs(p.position.y - position.y) < 200)) throw new Error("Overlapping district");
    const plotId = `${id}:plot:${row * 4 + col + 1}`, entrance = `${plotId}:door`, parent = nav.find((n) => n.id === nodeId(row, col < 2 ? col : col + 1))!;
    const door = { x: position.x, y: position.y + 48 };
    nav.push({ id: entrance, ...door, neighbors: [parent.id] }); parent.neighbors.push(entrance);
    roads.push({ from: door, to: { x: parent.x, y: parent.y }, width: 17 });
    world.plots.push({ id: plotId, districtId: id, position, entranceNodeId: entrance, buildingId: null }); district.plotIds.push(plotId);
  }
  // The only link to the original town is its east street; later links join new cells.
  const dx = cell.x - previous.x, dy = cell.y - previous.y;
  const fromPort = dx ? `1-${dx > 0 ? 4 : 0}` : `${dy > 0 ? 2 : 0}-2`;
  const toPort = dx ? `1-${dx > 0 ? 0 : 4}` : `${dy > 0 ? 0 : 2}-2`;
  const from = nav.find((n) => n.id === (index === 1 ? fromPort : `neighborhood-${index - 1}:road:${fromPort}`))!;
  const to = nav.find((n) => n.id === `${id}:road:${toPort}`)!;
  from.neighbors.push(to.id); to.neighbors.push(from.id);
  roads.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, width: 34 });
  for (const tx of [300, 600, 1000, 1300]) for (const ty of [90, 1080]) world.layout.trees.push({ x: x + tx + random() * 16, y: y + ty, size: 0.75 + random() * 0.2, variant: Math.floor(random() * 3) });
  for (const tx of [70, 1530]) for (const ty of [210, 970]) world.layout.trees.push({ x: x + tx, y: y + ty, size: 0.85, variant: Math.floor(random() * 3) });
  for (let i = 0; i < 12; i++) world.layout.flowers.push({ x: x + 620 + random() * 50, y: y + 150 + random() * 170, color: [0xe9a6ac, 0xffdb85, 0xc1b1df][Math.floor(random() * 3)] });
  world.districts.push(district);
  return world;
}

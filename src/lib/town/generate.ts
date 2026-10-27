import type { PathNode, Town } from "./types";

/** Mulberry32: all procedural choices use this local PRNG, never Math.random. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTown(seed: number): Town {
  const random = seededRandom(seed);
  const roofs = [0xc57965, 0x688e98, 0x889a6b, 0xb98b63, 0x9585a7];
  const walls = [0xffedcd, 0xf4ddbc, 0xf5e7db, 0xe7e8d4];
  const flowerColors = [0xe9a6ac, 0xffdb85, 0xc1b1df];
  const town: Town = {
    seed: seed >>> 0, width: 1600, height: 1120,
    plaza: { x: 800, y: 555 }, hall: { x: 800, y: 265 },
    houses: [], trees: [], roads: [], expansion: [], navigation: [], flowers: [],
  };
  const columns = [260, 500, 1100, 1340];
  const rows = [280, 530, 780];
  for (const [row, y] of rows.entries()) {
    for (const [col, x] of columns.entries()) {
      town.houses.push({
        id: `home-${row * columns.length + col + 1}`,
        x, y: y + Math.floor(random() * 12) - 6,
        roof: roofs[Math.floor(random() * roofs.length)],
        wall: walls[Math.floor(random() * walls.length)],
        style: Math.floor(random() * 3), flowers: flowerColors[Math.floor(random() * 3)],
      });
    }
  }
  const navXs = [260, 500, 800, 1100, 1340];
  const navYs = [380, 630, 880];
  navYs.forEach((y, row) => {
    town.roads.push({ from: { x: 145, y }, to: { x: 1455, y }, width: 34 });
    navXs.forEach((x, col) => {
      const node: PathNode = { id: `${row}-${col}`, x, y, neighbors: [] };
      if (col > 0) node.neighbors.push(`${row}-${col - 1}`);
      if (col < navXs.length - 1) node.neighbors.push(`${row}-${col + 1}`);
      if (col === 2 && row > 0) node.neighbors.push(`${row - 1}-${col}`);
      if (col === 2 && row < navYs.length - 1) node.neighbors.push(`${row + 1}-${col}`);
      town.navigation.push(node);
    });
  });
  town.roads.push({ from: { x: 800, y: 320 }, to: { x: 800, y: 1030 }, width: 48 });
  town.houses.forEach((house, index) => {
    const roadY = navYs[Math.floor(index / 4)];
    const door = { x: house.x, y: house.y + 48 };
    town.roads.push({ from: door, to: { x: house.x, y: roadY }, width: 17 });
    const parent = town.navigation[Math.floor(index / 4) * 5 + (index % 4 < 2 ? index % 4 : index % 4 + 1)];
    parent.neighbors.push(house.id);
    town.navigation.push({ ...door, id: house.id, neighbors: [parent.id] });
  });
  town.navigation.push({ id: "hall", x: 800, y: 325, neighbors: ["0-2"] });
  town.navigation.find((node) => node.id === "0-2")!.neighbors.push("hall");
  // A ring routes the Mayor around the plaza's fountain instead of through it.
  const middle = town.navigation.find((node) => node.id === "1-2")!;
  const top = town.navigation.find((node) => node.id === "0-2")!;
  top.neighbors = top.neighbors.filter((id) => id !== middle.id);
  middle.neighbors = middle.neighbors.filter((id) => id !== top.id);
  for (const side of [-1, 1]) {
    const a = `plaza-${side}-top`, b = `plaza-${side}-bottom`;
    town.navigation.push(
      { id: a, x: 800 + side * 75, y: 455, neighbors: [top.id, b] },
      { id: b, x: 800 + side * 75, y: 615, neighbors: [a, middle.id] },
    );
    top.neighbors.push(a); middle.neighbors.push(b);
  }
  town.expansion = [{ x: 470, y: 1000 }, { x: 1130, y: 1000 }];
  town.expansion.forEach((plot) => town.roads.push({ from: { x: plot.x, y: 880 }, to: plot, width: 16 }));
  // Border trees plus small groves in the gaps between blocks; never on streets.
  for (let x = 70; x < 1550; x += 62) {
    for (const y of [85, 1090]) town.trees.push({ x: x + random() * 24, y: y + random() * 18, size: 0.7 + random() * 0.5, variant: Math.floor(random() * 3) });
  }
  for (let y = 190; y < 1050; y += 90) {
    for (const x of [65, 1535]) town.trees.push({ x: x + random() * 15, y, size: 0.8 + random() * 0.4, variant: Math.floor(random() * 3) });
  }
  for (const x of [640, 960]) for (const y of [240, 760, 945]) {
    town.trees.push({ x: x + random() * 15, y, size: 0.85 + random() * 0.2, variant: Math.floor(random() * 3) });
  }
  for (let i = 0; i < 95; i++) {
    const x = 120 + random() * 1360, y = 130 + random() * 890;
    const onRoad = town.roads.some(({ from, to, width }) => x >= Math.min(from.x, to.x) - width && x <= Math.max(from.x, to.x) + width && y >= Math.min(from.y, to.y) - width && y <= Math.max(from.y, to.y) + width);
    const onPlot = [...town.houses, town.hall, town.plaza, ...town.expansion].some((p) => Math.abs(p.x - x) < 130 && Math.abs(p.y - y) < 115);
    if (!onRoad && !onPlot) town.flowers.push({ x, y, color: flowerColors[Math.floor(random() * 3)] });
  }
  return town;
}

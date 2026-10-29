import { Container, Graphics, Text } from "pixi.js";
import type { House, Town, Tree } from "../town/types";
import { intersects, type Bounds } from "./camera";
import { mayorPalette } from "../mayor/presets";

const palette = { grass: 0xaacb91, dark: 0x425e4d, road: 0xe9d5ac, edge: 0xc9b58d };
function label(parent: Container, text: string, x: number, y: number, size = 12, color = palette.dark) {
  const item = new Text({ text, style: { fontFamily: "Arial, sans-serif", fontSize: size, fontWeight: "600", fill: color, letterSpacing: 1 } });
  item.anchor.set(0.5); item.position.set(x, y); parent.addChild(item);
}
function flower(g: Graphics, x: number, y: number, color: number) {
  g.moveTo(x, y).lineTo(x, y + 7).stroke({ color: 0x6c9459, width: 2 });
  g.circle(x - 3, y, 3).circle(x + 3, y, 3).circle(x, y - 3, 3).fill(color);
  g.circle(x, y, 2).fill(0xffedb4);
}
export function houseView(house: House) {
  const c = new Container(); c.position.set(house.x, house.y); c.zIndex = house.y + 50;
  const g = new Graphics(); c.addChild(g);
  g.roundRect(-103, -58, 206, 150, 20).fill(0xb8d49e);
  g.roundRect(-90, -49, 180, 132, 13).stroke({ color: 0x99bc81, width: 2 });
  g.roundRect(-8, 48, 16, 45, 3).fill(palette.road);
  // Fence rails and posts leave a front gate at the path.
  for (const side of [-1, 1]) {
    g.roundRect(side < 0 ? -96 : 28, 70, 68, 5, 2).fill(house.fence ?? 0xf1e5c8);
    for (let i = 0; i < 5; i++) g.roundRect((side < 0 ? -96 : 28) + i * 16, 62, 5, 20, 2).fill(house.fence ?? 0xfff0d5);
  }
  g.ellipse(5, 45, 73, 17).fill({ color: 0x58784d, alpha: 0.18 });
  g.roundRect(-58, -24, 116, 77, 7).fill(house.wall);
  g.poly([42, -24, 58, -24, 58, 49, 42, 53]).fill({ color: 0xa78767, alpha: 0.22 });
  g.roundRect(-64, -31, 128, 12, 5).fill(0x896d56);
  g.poly([-72, -28, -48, -75, 43, -75, 72, -28]).fill(house.roof);
  g.poly([-72, -28, -48, -75, -41, -75, -61, -28]).fill({ color: 0xffffff, alpha: 0.16 });
  for (let i = 1; i <= 3; i++) g.moveTo(-67 + i * 5, -28 - i * 11).lineTo(67 - i * 6, -28 - i * 11).stroke({ color: 0x513e36, alpha: 0.12, width: 2 });
  if (house.style !== 1) {
    g.roundRect(29, -87, 17, 31, 2).fill(0xb98972);
    g.roundRect(26, -88, 23, 6, 2).fill(0xe3c3a0);
  }
  if (house.style === 2) {
    g.poly([-19, -38, 0, -62, 19, -38]).fill(0xffe7c6);
    g.circle(0, -42, 7).fill(0x769b9a).stroke({ color: 0xfff3d9, width: 3 });
  }
  for (const x of [-35, 35]) {
    g.roundRect(x - 12, -9, 24, 27, 4).fill(0xfff5dc);
    g.roundRect(x - 9, -6, 18, 21, 2).fill(0x86b1af);
    g.moveTo(x, -5).lineTo(x, 14).moveTo(x - 9, 4).lineTo(x + 9, 4).stroke({ color: 0xfff2cf, width: 2 });
    g.roundRect(x - 15, 18, 30, 8, 2).fill(0xad8061);
    for (let i = -1; i <= 1; i++) flower(g, x + i * 8, 16, house.flowers);
  }
  g.roundRect(-12, 13, 24, 40, 8).fill(house.door ?? 0x9b765b);
  g.roundRect(-8, 18, 16, 15, 4).fill(0xe1c799);
  g.circle(6, 37, 2).fill(0xffe2a3);
  g.roundRect(-20, 48, 40, 8, 3).fill(0xd3b793);
  g.roundRect(69, 24, 5, 27, 2).fill(0x967957);
  g.roundRect(62, 19, 20, 13, 4).fill(house.roof);
  if (house.garden === "stones") {
    g.ellipse(-78, 45, 17, 10).fill(0xd3d1b8); g.ellipse(-83, 42, 7, 4).fill(0xeee8d1); g.ellipse(-66, 49, 6, 5).fill(0xacae99);
  } else if (house.garden === "herbs") {
    g.roundRect(-95, 36, 34, 23, 5).fill(0xa98865);
    for (let i = 0; i < 3; i++) g.ellipse(-88 + i * 10, 36, 6, 12).fill(i % 2 ? 0x83a56d : 0x63856c);
  } else {
    g.circle(-77, 40, 14).circle(-83, 47, 11).fill(0x7da66a);
    for (let i = 0; i < 4; i++) flower(g, -81 + i * 6, 37 + (i % 2) * 5, house.flowers);
  }
  if (house.accent === "lantern") {
    g.roundRect(79, -16, 4, 38, 2).fill(0x657663);
    g.roundRect(72, -28, 18, 18, 5).fill(0xffdc8f).stroke({ color: 0x657663, width: 2 });
    g.poly([70, -28, 81, -36, 92, -28]).fill(house.roof);
  } else if (house.accent === "birdhouse") {
    g.roundRect(78, -4, 4, 27, 2).fill(0x967957);
    g.roundRect(70, -23, 24, 24, 3).fill(0xffe8c5); g.poly([66, -22, 82, -37, 98, -22]).fill(house.roof);
    g.circle(82, -13, 5).fill(0x657663);
  }
  if (house.name) label(c, house.name, 0, 106, 11);
  return c;
}
function treeView(tree: Tree) {
  const g = new Graphics(); g.position.set(tree.x, tree.y); g.scale.set(tree.size); g.zIndex = tree.y;
  const colors = [0x6e9d71, 0x83aa73, 0x91b47a];
  g.ellipse(7, 6, 30, 11).fill({ color: 0x44664b, alpha: 0.15 });
  g.roundRect(-5, -40, 10, 45, 4).fill(0x9c8059);
  g.circle(0, -48, 29).circle(-19, -31, 22).circle(20, -32, 24).fill(colors[tree.variant]);
  g.circle(-8, -57, 18).circle(-23, -39, 12).fill({ color: 0xc3dba0, alpha: 0.28 });
  g.circle(17, -23, 10).fill({ color: 0x446d52, alpha: 0.12 });
  if (tree.variant === 1) g.circle(-15, -33, 4).circle(13, -47, 4).circle(18, -23, 4).fill(0xe1ac7c);
  return g;
}

export function drawTown(town: Town) {
  const world = new Container();
  const scenery: { view: Container; bounds: Bounds }[] = [];
  for (const region of town.regions ?? []) {
    const view = new Container();
    view.addChild(new Graphics().roundRect(region.x + 25, region.y + 40, region.width - 50, region.height - 75, 90).fill(palette.grass));
    label(view, region.name.toUpperCase(), region.x + 800, region.y + 160, 18, 0x627e50);
    world.addChild(view); scenery.push({ view, bounds: region });
  }
  const terrain = new Graphics(); world.addChild(terrain);
  terrain.roundRect(25, 55, 1550, 1050, 130).fill(0x95b982);
  terrain.roundRect(40, 40, 1520, 1045, 125).fill(palette.grass);
  // Quiet texture keeps the generated graphics readable at wide camera scales.
  for (let x = 120; x < 1500; x += 43) for (let y = 145; y < 1060; y += 39) {
    terrain.moveTo(x, y).lineTo(x - 2, y - 4).moveTo(x + 3, y).lineTo(x + 5, y - 3).stroke({ color: 0x749d67, alpha: 0.18, width: 1.5 });
  }
  for (const road of town.roads) {
    terrain.moveTo(road.from.x, road.from.y).lineTo(road.to.x, road.to.y).stroke({ color: palette.edge, width: road.width + 5, cap: "round" });
  }
  for (const road of town.roads) {
    terrain.moveTo(road.from.x, road.from.y).lineTo(road.to.x, road.to.y).stroke({ color: palette.road, width: road.width, cap: "round" });
  }
  terrain.roundRect(681, 421, 238, 221, 52).fill(0xcab995);
  terrain.roundRect(687, 415, 226, 221, 48).fill(0xf0dfbc);
  for (let x = 703; x < 900; x += 24) for (let y = 435; y < 630; y += 24) terrain.roundRect(x, y, 19, 19, 4).fill({ color: 0xd9c6a4, alpha: 0.4 });
  const lots = new Container(); world.addChild(lots);
  function syncLots(plots: Town["expansion"]) {
    for (const child of lots.removeChildren()) child.destroy({ children: true });
    for (const plot of plots) {
      const view = new Graphics().roundRect(plot.x - 113, plot.y - 39, 226, 76, 17).fill(0xb7ce9a).stroke({ color: 0x89aa73, width: 2 });
      for (const side of [-1, 1]) view.roundRect(plot.x + side * 99, plot.y - 29, 5, 56, 2).fill(0xe8dfbf);
      lots.addChild(view);
      label(lots, "ROOM TO GROW", plot.x, plot.y - 4, 13, 0x657e55);
      label(lots, "Future neighborhood", plot.x, plot.y + 16, 10, 0x6c835e);
    }
  }
  syncLots(town.expansion);
  town.flowers.forEach((f) => flower(terrain, f.x, f.y, f.color));
  const actors = new Container(); actors.sortableChildren = true; world.addChild(actors);
  const homes = new Map<string, { view: Container; signature: string; bounds: Bounds }>();
  function syncHouses(houses: House[]) {
    const ids = new Set(houses.map((h) => h.id));
    for (const [id, item] of homes) if (!ids.has(id)) { item.view.destroy({ children: true }); homes.delete(id); }
    for (const house of houses) {
      const signature = JSON.stringify(house), old = homes.get(house.id);
      if (old?.signature === signature) continue;
      old?.view.destroy({ children: true }); const view = houseView(house); actors.addChild(view);
      homes.set(house.id, { view, signature, bounds: { x: house.x - 120, y: house.y - 100, width: 240, height: 225 } });
    }
  }
  syncHouses(town.houses);
  town.trees.forEach((t) => { const view = treeView(t); actors.addChild(view); scenery.push({ view, bounds: { x: t.x - 60, y: t.y - 100, width: 120, height: 120 } }); });
  const hall = new Container(); hall.position.set(town.hall.x, town.hall.y); hall.zIndex = town.hall.y + 60;
  const h = new Graphics(); hall.addChild(h);
  h.ellipse(8, 55, 108, 20).fill({ color: 0x53784d, alpha: 0.17 });
  h.roundRect(-88, -42, 176, 100, 8).fill(0xffecd0);
  h.roundRect(-98, -48, 196, 14, 4).fill(0x597f7b);
  h.poly([-107, -45, -72, -105, 72, -105, 107, -45]).fill(0x6d9590);
  h.poly([-107, -45, -72, -105, -59, -105, -88, -45]).fill(0x89aaa1);
  h.roundRect(-27, -116, 54, 80, 5).fill(0xf7e5c4);
  h.poly([-36, -111, 0, -142, 36, -111]).fill(0x547d77);
  h.circle(0, -88, 17).fill(0xfff8de).stroke({ color: 0xc6ac79, width: 3 });
  h.moveTo(0, -100).lineTo(0, -88).lineTo(9, -84).stroke({ color: palette.dark, width: 2 });
  h.moveTo(0, -143).lineTo(0, -166).stroke({ color: 0x8c7656, width: 3 });
  h.poly([1, -165, 31, -157, 1, -150]).fill(0xe4aa70);
  for (const x of [-59, 59]) {
    h.roundRect(x - 16, -17, 32, 39, 6).fill(0x82a9a3).stroke({ color: 0xffffff, width: 4 });
    h.moveTo(x, -15).lineTo(x, 20).moveTo(x - 14, 3).lineTo(x + 14, 3).stroke({ color: 0xfff1d1, width: 3 });
  }
  h.roundRect(-20, 4, 40, 54, 12).fill(0x9b7856);
  h.roundRect(-32, 53, 64, 10, 3).fill(0xd5be94);
  h.roundRect(-40, 62, 80, 8, 3).fill(0xe9d5b1);
  label(hall, "TOWN HALL", 0, -24, 11);
  actors.addChild(hall);
  // Plaza fountain, planters, benches and street lamps.
  const fountain = new Graphics(); fountain.position.set(800, 540); fountain.zIndex = 570;
  fountain.ellipse(5, 17, 49, 22).fill({ color: 0x5c7b69, alpha: 0.16 });
  fountain.ellipse(0, 5, 42, 27).fill(0xb8bda5);
  fountain.ellipse(0, 0, 42, 27).fill(0xe8e4cd);
  fountain.ellipse(0, 0, 33, 20).fill(0x7ebbb9);
  fountain.ellipse(0, -1, 24, 12).stroke({ color: 0xc4e1d5, width: 2 });
  fountain.roundRect(-6, -32, 12, 34, 5).fill(0xe9e2c7);
  fountain.ellipse(0, -31, 19, 9).fill(0xd8dcc1);
  fountain.ellipse(0, -33, 15, 6).fill(0x99cfcc);
  fountain.circle(0, -42, 5).fill(0xc7e9de);
  actors.addChild(fountain);
  for (const x of [701, 899]) for (const y of [447, 614]) {
    const pot = new Graphics(); pot.zIndex = y; pot.position.set(x, y);
    pot.roundRect(-12, -8, 24, 20, 4).fill(0xba9674);
    pot.circle(-6, -11, 10).circle(7, -10, 10).fill(0x6f995e);
    flower(pot, -4, -18, 0xf2bdad); flower(pot, 7, -16, 0xffdb85); actors.addChild(pot);
  }
  for (const x of [650, 950]) {
    const bench = new Graphics(); bench.position.set(x, 552); bench.zIndex = 560;
    bench.roundRect(-22, -9, 44, 7, 2).roundRect(-22, 1, 44, 7, 2).fill(0xb08a60);
    bench.moveTo(-15, 8).lineTo(-15, 16).moveTo(15, 8).lineTo(15, 16).stroke({ color: 0x6d7860, width: 4 }); actors.addChild(bench);
  }
  for (const x of [171, 620, 980, 1429]) for (const y of [394, 644, 894]) {
    const lamp = new Graphics(); lamp.position.set(x, y); lamp.zIndex = y;
    lamp.roundRect(-2, -36, 4, 37, 2).fill(0x6b7d65);
    lamp.roundRect(-7, -46, 14, 14, 4).fill(0xffe8b0).stroke({ color: 0x6b7d65, width: 2 });
    lamp.poly([-9, -45, 0, -53, 9, -45]).fill(0x6b7d65); actors.addChild(lamp);
  }
  label(world, "WILLOW GREEN", 800, 699, 11, 0x6f885c);
  return { world, actors, syncHouses, syncLots, cull(viewport: Bounds) {
    for (const item of scenery) item.view.visible = intersects(item.bounds, viewport);
    for (const item of homes.values()) item.view.visible = intersects(item.bounds, viewport);
  } };
}

export function drawMayor(preset?: string) {
  const colors = mayorPalette(preset);
  const mayor = new Container();
  const shadow = new Graphics().ellipse(0, 4, 16, 6).fill({ color: 0x445f49, alpha: 0.2 });
  const body = new Container();
  const tail = new Graphics().moveTo(10, -8).bezierCurveTo(32, -3, 29, -30, 19, -23).stroke({ color: colors.tail, width: 8, cap: "round" });
  const cat = new Graphics();
  cat.ellipse(0, -9, 13, 17).fill(colors.body);
  cat.roundRect(-12, -2, 9, 8, 4).roundRect(4, -2, 9, 8, 4).fill(colors.paws);
  cat.poly([-16, -29, -17, -48, -4, -38]).poly([16, -29, 17, -48, 4, -38]).fill(colors.ears);
  cat.poly([-13, -34, -13, -43, -6, -37]).poly([13, -34, 13, -43, 6, -37]).fill(0xdba59e);
  cat.ellipse(0, -29, 18, 15).fill(colors.face);
  if (colors.stripes !== null) cat.moveTo(-7, -42).lineTo(-5, -36).moveTo(0, -43).lineTo(0, -36).moveTo(7, -42).lineTo(5, -36).stroke({ color: colors.stripes, width: 2.5, cap: "round" });
  cat.ellipse(-10, -25, 4, 2).ellipse(10, -25, 4, 2).fill(0xe9b5a7);
  cat.circle(-6, -30, 2).circle(6, -30, 2).fill(colors.eyes);
  cat.poly([-2, -25, 2, -25, 0, -22]).fill(0xb58378);
  cat.moveTo(-4, -20).quadraticCurveTo(0, -17, 4, -20).stroke({ color: 0x8f7462, width: 1.3 });
  cat.moveTo(-14, -24).lineTo(-22, -26).moveTo(14, -24).lineTo(22, -26).stroke({ color: 0xb99a79, width: 1.2 });
  cat.roundRect(-12, -15, 24, 6, 3).fill(0x72998e);
  cat.poly([3, -12, 10, -11, 7, 0, 2, -4]).fill(0x72998e);
  cat.circle(0, -11, 3).fill(0xf5cb76);
  body.addChild(tail, cat); mayor.addChild(shadow, body); mayor.scale.set(1.3);
  return { mayor, body, tail };
}

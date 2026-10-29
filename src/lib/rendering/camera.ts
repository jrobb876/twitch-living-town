import type { TownWorld } from "../simulation/types";
export type Bounds = { x: number; y: number; width: number; height: number };
export function worldBounds(world: TownWorld): Bounds {
  let left = 0, top = 0, right = world.layout.width, bottom = world.layout.height;
  for (const district of world.districts) if (district.generation) {
    const g = district.generation;
    left = Math.min(left, g.x); top = Math.min(top, g.y); right = Math.max(right, g.x + g.width); bottom = Math.max(bottom, g.y + g.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function fitCamera(bounds: Bounds, width: number, height: number) {
  const scale = Math.min(width / bounds.width, height / bounds.height) * 0.96;
  return { scale, x: (width - bounds.width * scale) / 2 - bounds.x * scale, y: (height - bounds.height * scale) / 2 - bounds.y * scale };
}
export function clampCameraPosition(bounds: Bounds, width: number, height: number, scale: number, x: number, y: number) {
  return { x: Math.max(80 - (bounds.x + bounds.width) * scale, Math.min(width - 80 - bounds.x * scale, x)),
    y: Math.max(80 - (bounds.y + bounds.height) * scale, Math.min(height - 80 - bounds.y * scale, y)) };
}
export function intersects(a: Bounds, b: Bounds) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }

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
/** OBS background fills the viewport by cropping, with one uniform art scale.
 * Keep the website's padded Fit Town framing separate. */
export function coverCamera(bounds: Bounds, width: number, height: number) {
  const scale = Math.max(width / bounds.width, height / bounds.height);
  return { scale, x: (width - bounds.width * scale) / 2 - bounds.x * scale, y: (height - bounds.height * scale) / 2 - bounds.y * scale };
}
export function clampCameraPosition(bounds: Bounds, width: number, height: number, scale: number, x: number, y: number) {
  return { x: Math.max(80 - (bounds.x + bounds.width) * scale, Math.min(width - 80 - bounds.x * scale, x)),
    y: Math.max(80 - (bounds.y + bounds.height) * scale, Math.min(height - 80 - bounds.y * scale, y)) };
}
export function intersects(a: Bounds, b: Bounds) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }

/** Close neighborhood framing, with strict edge bounds (including negative expansion coordinates). */
export function followCamera(bounds: Bounds, width: number, height: number, target: { x: number; y: number }) {
  const scale = Math.max(width / 950, height / 650);
  const axis = (size: number, start: number, length: number, position: number) => length * scale <= size
    ? (size - length * scale) / 2 - start * scale
    : Math.max(size - (start + length) * scale, Math.min(-start * scale, size / 2 - position * scale));
  return { scale, x: axis(width, bounds.x, bounds.width, target.x), y: axis(height, bounds.y, bounds.height, target.y) };
}
export function smoothCamera(current: { x: number; y: number }, target: { x: number; y: number }, seconds: number) {
  const blend = 1 - Math.exp(-3 * Math.max(0, Math.min(seconds, 0.1)));
  return { x: current.x + (target.x - current.x) * blend, y: current.y + (target.y - current.y) * blend };
}

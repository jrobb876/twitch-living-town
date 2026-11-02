import type { TownWorld } from "../simulation/types";
import { clampCameraPosition, fitCamera, worldBounds } from "./camera";
export type CameraPose = { x: number; y: number; scale: number };
/** Matches houseView's artwork/lot bounds, including roof, garden and fence. */
export function houseFocusCamera(world: TownWorld, houseId: string, width: number, height: number): CameraPose | null {
  const house = world.buildings.find((building) => building.kind === "house" && building.id === houseId);
  if (!house || width <= 0 || height <= 0) return null;
  const bounds = worldBounds(world), fit = fitCamera(bounds, width, height).scale;
  // Reserve top/bottom room for map badges and controls, and show neighboring roads.
  const scale = Math.max(fit * 0.7, Math.min(Math.max(3.5, fit * 3.5), width / 520, Math.max(1, height - 100) / 400));
  const center = { x: house.position.x, y: house.position.y + 12.5 };
  return { scale, ...clampCameraPosition(bounds, width, height, scale, width / 2 - center.x * scale, height / 2 - center.y * scale) };
}
export function houseFocusPose(from: CameraPose, to: CameraPose, milliseconds: number, reduced: boolean): CameraPose {
  const t = reduced ? 1 : Math.max(0, Math.min(1, milliseconds / 650));
  if (t === 0) return from;
  if (t === 1) return to;
  const ease = t * t * (3 - 2 * t);
  return { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease, scale: from.scale + (to.scale - from.scale) * ease };
}

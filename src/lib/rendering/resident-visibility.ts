import type { Bounds } from "./camera";

/** Screen-pixel overscan/hysteresis keeps small pans from toggling actors at the edge.
 * Model positions and identities are never changed by a camera decision. */
export function residentVisible(position: { x: number; y: number }, viewport: Bounds, scale: number, wasVisible: boolean, showTown = true) {
  if (!showTown) return false;
  const margin = (wasVisible ? 160 : 96) / Math.max(0.001, scale);
  return position.x >= viewport.x - margin && position.x <= viewport.x + viewport.width + margin
    && position.y >= viewport.y - margin && position.y <= viewport.y + viewport.height + margin;
}

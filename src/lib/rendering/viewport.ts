/** Logical CSS pixels stay independent of backing-buffer density. Pixi autoDensity
 * applies the capped resolution to the buffer, not to camera/world coordinates. */
export function rendererViewport(host: { clientWidth: number; clientHeight: number }, devicePixelRatio: number) {
  return { width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight),
    resolution: Math.min(Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1, 2) };
}

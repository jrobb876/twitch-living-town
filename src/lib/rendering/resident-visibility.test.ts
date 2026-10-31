import assert from "node:assert/strict";
import test from "node:test";
import { residentVisible } from "./resident-visibility";
import { coverCamera, followCamera, worldBounds } from "./camera";
import { createExpandedPreview } from "../overlay/preview";
import { defaultDisplay, spotlightComposition } from "../overlay/model";
import { createSession } from "../simulation/world";

test("resident viewport overscan uses screen pixels, hysteresis and hidden-town suppression", () => {
  const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.ok(residentVisible({ x: -90, y: 0 }, viewport, 1, false));
  assert.equal(residentVisible({ x: -110, y: 0 }, viewport, 1, false), false);
  assert.ok(residentVisible({ x: -110, y: 0 }, viewport, 1, true));
  assert.equal(residentVisible({ x: -170, y: 0 }, viewport, 1, true), false);
  assert.ok(residentVisible({ x: -45, y: 0 }, viewport, 2, false));
  assert.equal(residentVisible({ x: -55, y: 0 }, viewport, 2, false), false);
  assert.equal(residentVisible({ x: 500, y: 500 }, viewport, 1, true, false), false);
});

test("1920x1080 camera movement prioritizes nearby residents without changing their identities or positions", () => {
  const world = createExpandedPreview(200, 42), state = createSession(world), before = JSON.stringify(state);
  const bounds = worldBounds(world);
  for (const mode of ["living-town", "spotlight"] as const) {
    const camera = mode === "living-town" ? followCamera(bounds, 1920, 1080, world.layout.hall) : coverCamera(bounds, 1920, 1080);
    const viewport = { x: -camera.x / camera.scale, y: -camera.y / camera.scale, width: 1920 / camera.scale, height: 1080 / camera.scale };
    const visible = state.runtime.residentActors.filter((r) => residentVisible(r.actor.position, viewport, camera.scale, false));
    assert.ok(visible.length > 0, "default framing should include a populated area");
    for (const resident of visible) assert.ok(residentVisible(resident.actor.position, { ...viewport, x: viewport.x + 10 / camera.scale }, camera.scale, true), "small camera moves retain near-edge actors");
    // A broad Spotlight cover view may legitimately include the whole populated area.
    // Zooming into a neighborhood must skip far-away actors without replacing the pool.
    const local = state.runtime.residentActors[0].actor.position;
    const close = { x: local.x - 475, y: local.y - 267, width: 950, height: 534 };
    const nearby = state.runtime.residentActors.filter((r) => residentVisible(r.actor.position, close, 2, false));
    assert.ok(nearby.length > 0 && nearby.length < 200);
  }
  const transparent = spotlightComposition(1920, 1080, { ...defaultDisplay, mode: "spotlight", background: "transparent" });
  assert.equal(transparent.showTown, false);
  assert.equal(state.runtime.residentActors.filter((r) => residentVisible(r.actor.position, bounds, 1, true, transparent.showTown)).length, 0);
  assert.equal(JSON.stringify(state), before);
});

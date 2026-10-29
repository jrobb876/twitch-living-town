import assert from "node:assert/strict";
import test from "node:test";
import { worldBounds, fitCamera, clampCameraPosition, intersects } from "./camera";
import { createWorld } from "../simulation/world";
import { addDistrict } from "../simulation/expansion";

test("Fit Town includes original landmarks and every expanded district, including negative coordinates", () => {
  let world = createWorld({ id: "demo", streamerTwitchUserId: "demo", seed: 42, name: "Test", mayorName: "Mochi" });
  for (let i = 0; i < 8; i++) world = addDistrict(world)!;
  const bounds = worldBounds(world); assert.deepEqual(bounds, { x: -1600, y: -1120, width: 4800, height: 3360 });
  const view = fitCamera(bounds, 1000, 600);
  assert.ok(view.x + bounds.x * view.scale >= 0 && view.y + bounds.y * view.scale >= 0);
  assert.ok(view.x + (bounds.x + bounds.width) * view.scale <= 1000);
  assert.ok(view.y + (bounds.y + bounds.height) * view.scale <= 600);
  const clamped = clampCameraPosition(bounds, 1000, 600, 1, 1e9, -1e9);
  assert.equal(clamped.x, 1000 - 80 - bounds.x); assert.equal(clamped.y, 80 - (bounds.y + bounds.height));
  assert.ok(intersects(bounds, { x: -1000, y: -1000, width: 100, height: 100 }));
  assert.equal(intersects(bounds, { x: 10000, y: 10000, width: 100, height: 100 }), false);
});

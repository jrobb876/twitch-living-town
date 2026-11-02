import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { houseFocusCamera, houseFocusPose } from "./house-focus";
import { maplebrook } from "../houses/subscriber-demo";
import { fixture } from "../auth/test-fixtures";
import { housesIn } from "../simulation/world";
import { fitCamera, worldBounds } from "./camera";

test("Find My House resolves IDs in expanded towns and centers the artwork with room at every viewport size", () => {
  const world = maplebrook(fixture().twitch.identity);
  for (const house of housesIn(world)) for (const [width, height] of [[1920, 1080], [1280, 720], [390, 400], [800, 300]]) {
    const target = houseFocusCamera(world, house.id, width, height)!;
    assert.ok(target.scale > fitCamera(worldBounds(world), width, height).scale);
    assert.ok(target.scale <= 3.5);
    assert.ok(Math.abs(house.position.x * target.scale + target.x - width / 2) < 0.01);
    assert.ok(Math.abs((house.position.y + 12.5) * target.scale + target.y - height / 2) < 0.01);
    assert.ok((house.position.x - 120) * target.scale + target.x >= 0);
    assert.ok((house.position.x + 120) * target.scale + target.x <= width);
    assert.ok((house.position.y - 100) * target.scale + target.y >= 30);
    assert.ok((house.position.y + 125) * target.scale + target.y <= height - 30);
    for (const from of [{ x: -5000, y: 1800, scale: 0.1 }, { x: 900, y: -3200, scale: 3.5 }]) {
      assert.deepEqual(houseFocusPose(from, target, 0, false), from);
      assert.deepEqual(houseFocusPose(from, target, 650, false), target);
      assert.deepEqual(houseFocusPose(from, target, 0, true), target);
      const middle = houseFocusPose(from, target, 325, false);
      assert.ok(Math.abs(middle.scale - (from.scale + target.scale) / 2) < 0.00001);
    }
    assert.deepEqual(houseFocusCamera(world, house.id, width, height), target);
  }
  assert.equal(houseFocusCamera(world, "missing", 1920, 1080), null);
  assert.equal(houseFocusCamera(world, world.mayor.id, 1920, 1080), null);
  assert.equal(houseFocusCamera(world, housesIn(world)[0].id, 0, 1080), null);
});

test("focus reuses the renderer camera, cancels for manual input, and cannot interfere with OBS framing", async () => {
  const source = await readFile("src/lib/rendering/create-renderer.ts", "utf8");
  assert.match(source, /if \(destroyed \|\| display\) return false/);
  assert.match(source, /const pan = .*houseTravel = null/);
  assert.match(source, /const zoomAt = [\s\S]*?houseTravel = null/);
  assert.match(source, /if \(!to \|\| !house\) return false/);
  assert.match(source, /selectedHome.visual.view.destroy\(\{ children: true \}\)/);
});

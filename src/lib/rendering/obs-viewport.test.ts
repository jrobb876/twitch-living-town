import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { coverCamera, fitCamera, followCamera, smoothCamera, worldBounds } from "./camera";
import { rendererViewport } from "./viewport";
import { defaultDisplay, spotlightComposition } from "../overlay/model";
import { createWorld } from "../simulation/world";
import { addDistrict } from "../simulation/expansion";

const sizes = [[1920, 1080], [1280, 720], [2560, 1440], [900, 1600], [2560, 720]];
test("OBS root explicitly removes inherited main layout constraints without changing website main", () => {
  // Stylesheet contract test, not a browser layout assertion. This catches the
  // original cross-route cascade regression without automated browser interaction.
  const css = readFileSync("src/app/globals.css", "utf8");
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`); assert.ok(start >= 0);
    return Object.fromEntries(css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start)).split(";").filter((s) => s.trim()).map((s) => s.split(":").map((p) => p.trim())));
  };
  const root = rule(".obs-root"), main = rule("\nmain");
  assert.equal(root.position, "fixed"); assert.equal(root.inset, "0");
  assert.equal(root["max-width"], "none"); assert.equal(root.padding, "0"); assert.equal(root.margin, "0");
  assert.equal(root.width, "100%"); assert.equal(root.height, "100%"); assert.equal(root.overflow, "hidden");
  assert.equal(root.background, "transparent");
  assert.equal(main["max-width"], "1800px"); assert.equal(main.padding, "0 4.2%"); assert.equal(main.margin, "0 auto");
  assert.equal(rule(".obs-canvas").width, "100%"); assert.equal(rule(".obs-canvas").height, "100%");
  assert.equal(rule(".obs-canvas canvas").width, "100%"); assert.equal(rule(".obs-canvas canvas").height, "100%");
});
test("resize uses full host CSS dimensions independent of backing-buffer density", () => {
  const host = { clientWidth: 1920, clientHeight: 1080 };
  for (const [width, height] of sizes) for (const dpr of [1, 1.25, 2, 3]) {
    host.clientWidth = width; host.clientHeight = height;
    const viewport = rendererViewport(host, dpr);
    assert.equal(viewport.width, width); assert.equal(viewport.height, height);
    assert.equal(viewport.resolution, Math.min(2, dpr));
    assert.equal((viewport.width * viewport.resolution) / (viewport.height * viewport.resolution), width / height);
  }
  assert.deepEqual(rendererViewport({ clientWidth: 0, clientHeight: 0 }, 0), { width: 1, height: 1, resolution: 1 });
});
test("Spotlight crops uniformly to cover core and expanded worlds while website fit retains its framing", () => {
  let world = createWorld({ id: "test", streamerTwitchUserId: "test", name: "Saved town", mayorName: "Mayor", seed: 42 });
  for (let i = 0; i <= 8; i++) {
    const bounds = worldBounds(world);
    for (const [width, height] of sizes) {
      const cover = coverCamera(bounds, width, height), fit = fitCamera(bounds, width, height);
      assert.ok(cover.scale > fit.scale);
      assert.ok(cover.x + bounds.x * cover.scale <= 1e-8);
      assert.ok(cover.y + bounds.y * cover.scale <= 1e-8);
      assert.ok(cover.x + (bounds.x + bounds.width) * cover.scale >= width - 1e-8);
      assert.ok(cover.y + (bounds.y + bounds.height) * cover.scale >= height - 1e-8);
      assert.ok(fit.x + bounds.x * fit.scale >= 0 && fit.y + bounds.y * fit.scale >= 0);
      const p = world.layout.navigation[0];
      const follow = followCamera(bounds, width, height, p), moved = followCamera(bounds, width, height, { x: p.x + 50, y: p.y });
      const smooth = smoothCamera(follow, moved, 1 / 30);
      assert.ok(Math.abs(smooth.x - follow.x) <= Math.abs(moved.x - follow.x));
      assert.ok(p.x * follow.scale + follow.x >= 0 && p.x * follow.scale + follow.x <= width);
    }
    if (i < 8) world = addDistrict(world)!;
  }
});
test("Spotlight Mayor stays fully visible across resize, sides and scale without losing transparent mode", () => {
  for (const [width, height] of sizes) for (const side of ["left", "right"] as const) for (const scale of [0.5, 1, 1.5]) {
    const settings = { ...defaultDisplay, mode: "spotlight" as const, side, scale, background: "transparent" as const };
    const view = spotlightComposition(width, height, settings);
    // Conservative bounds include tail, whiskers, shadow and animation bob.
    assert.ok(view.x - 26 * view.scale >= 0 && view.x + 35 * view.scale <= width);
    assert.ok(view.y - 55 * view.scale >= 0 && view.y + 12 * view.scale <= height);
    assert.equal(view.showTown, false); assert.equal(view.visible, true);
    const town = spotlightComposition(width, height, { ...settings, background: "town" });
    assert.deepEqual({ ...town, showTown: false }, view, "background choice must not alter Mayor placement or scale");
    assert.equal(spotlightComposition(width, height, { ...settings, mode: "living-town" }).showTown, true);
  }
});

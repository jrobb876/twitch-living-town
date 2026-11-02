import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createExpandedPreview, previewCounts, previewEnabled, previewInput, PREVIEW_ID } from "./preview";
import { startPreview } from "./preview-runtime";
import { defaultDisplay, overlayWorld, spotlightComposition } from "./model";
import { createWorld, housesIn } from "../simulation/world";
import { routeBetween } from "../simulation/behavior";
import { coverCamera, worldBounds } from "../rendering/camera";
import type { TownRenderer } from "../rendering/create-renderer";
import type { TownSession } from "../simulation/types";

for (const count of previewCounts) test(`${count} preview houses are exact totals with distinct fictional owners and connected plots`, () => {
  const world = createExpandedPreview(count, 42), houses = housesIn(world);
  assert.equal(houses.length, count); assert.equal(world.residents.length, count);
  assert.equal(new Set(houses.map((h) => h.ownerTwitchUserId)).size, count);
  assert.equal(new Set(houses.map((h) => h.plotId)).size, count);
  assert.equal(new Set(world.plots.map((p) => `${p.position.x},${p.position.y}`)).size, world.plots.length);
  assert.ok(houses.every((h) => h.ownerTwitchUserId?.startsWith("fictional-") && h.property?.customization.houseName));
  assert.ok(new Set(houses.map((h) => h.appearance.roofColor)).size >= 4);
  assert.ok(new Set(houses.map((h) => h.property?.customization.garden)).size === 3);
  for (const plot of world.plots) assert.ok(routeBetween(world.layout.navigation, "hall", plot.entranceNodeId).length);
  assert.ok(world.districts.some((d) => d.generation));
});

test("preview generation is deterministic and cannot modify an existing saved world", () => {
  const saved = createWorld({ id: "saved-town", streamerTwitchUserId: "1234", seed: 42, name: "Actual town", mayorName: "Nori" });
  const before = structuredClone(saved), a = createExpandedPreview(50, 42);
  assert.deepEqual(a, createExpandedPreview(50, 42)); assert.notDeepEqual(a, createExpandedPreview(50, 43));
  assert.deepEqual(saved, before); assert.equal(a.id, PREVIEW_ID); assert.notEqual(a.id, saved.id);
  for (const count of [0, 12, 24, 201, Infinity]) assert.throws(() => previewInput(count, 42));
  for (const seed of [-1, 1.1, NaN, 0x100000000]) assert.throws(() => previewInput(25, seed));
});

test("preview requires explicit development opt-in and a local host; production is always denied", async () => {
  assert.equal(previewEnabled({ NODE_ENV: "development", TOWN_DEMO_MODE: "true" }, "localhost:3000"), true);
  for (const env of [{}, { NODE_ENV: "development" }, { NODE_ENV: "production", TOWN_DEMO_MODE: "true" },
    { NODE_ENV: "development", TOWN_DEMO_MODE: "true", PUBLIC_DEPLOYMENT: "true" }]) assert.equal(previewEnabled(env, "localhost:3000"), false);
  for (const host of [null, "evil.example", "localhost.evil.example:3000", "localhost@evil.example", "[::]:3000"]) {
    assert.equal(previewEnabled({ NODE_ENV: "development", TOWN_DEMO_MODE: "true" }, host), false);
  }
  const page = await readFile("src/app/demo/obs-preview/page.tsx", "utf8");
  assert.match(page, /if \(!previewEnabled.*notFound\(\)/);
  for (const path of ["src/lib/overlay/preview.ts", "src/lib/overlay/preview-runtime.ts", "src/components/expanded-obs-preview.tsx", "src/app/demo/obs-preview/page.tsx"]) {
    const text = await readFile(path, "utf8");
    assert.doesNotMatch(text, /fetch\(|localStorage|sessionStorage|supabase|\/api\/|getAuthService|subscribers\/|persistence\//);
  }
});

test("both OBS display modes consume the same simulated visual world without live grants", () => {
  const world = overlayWorld(createExpandedPreview(200, 42)), bounds = worldBounds(world);
  assert.equal(housesIn(world).length, 200); assert.equal(world.residents.length, 0);
  for (const mode of ["living-town", "spotlight"] as const) {
    const composition = spotlightComposition(1920, 1080, { ...defaultDisplay, mode });
    assert.equal(composition.showTown, true); assert.equal(composition.visible, mode === "spotlight");
  }
  const camera = coverCamera(bounds, 1920, 1080);
  assert.ok(bounds.width * camera.scale >= 1920 && bounds.height * camera.scale >= 1080);
});

test("preview mode switching reuses resources; reset destroys its timer/renderer and returns to actual overview", async () => {
  const saved = createWorld({ id: "actual", streamerTwitchUserId: "123", seed: 42, name: "Actual", mayorName: "Nori" });
  const original = structuredClone(saved), world = createExpandedPreview(25, 42);
  let destroyed = 0, stopped = 0, constructions = 0, ticks = () => {}, now = 0, updated: TownSession | undefined;
  const renderer: TownRenderer = { destroy: () => { destroyed++; }, update: (state) => { updated = state; }, setDisplay: () => {}, zoom: () => {}, pan: () => {}, reset: () => {}, focusEvent: () => {}, focusHouse: () => false };
  const owner = startPreview(world, defaultDisplay, async () => { constructions++; return renderer; }, (tick) => { ticks = tick; return () => { stopped++; }; }, () => now);
  await owner.ready; owner.setDisplay({ ...defaultDisplay, mode: "spotlight" });
  now = 2000; ticks(); assert.equal(updated?.world, world, "ticks retain geometry instead of regenerating");
  assert.equal(constructions, 1); assert.equal(owner.reset(), "/town-overview"); owner.destroy();
  assert.equal(destroyed, 1); assert.equal(stopped, 1); assert.deepEqual(saved, original);
  assert.throws(() => startPreview(saved, defaultDisplay, async () => renderer));
});

test("switching previews during asynchronous Pixi initialization destroys the late instance without starting a timer", async () => {
  const waiting = Promise.withResolvers<TownRenderer>(); let destroyed = 0, timers = 0;
  const owner = startPreview(createExpandedPreview(25, 42), defaultDisplay, async () => waiting.promise,
    () => { timers++; return () => {}; });
  owner.destroy(); waiting.resolve({ destroy: () => { destroyed++; } } as TownRenderer); await owner.ready;
  assert.equal(destroyed, 1); assert.equal(timers, 0);
});

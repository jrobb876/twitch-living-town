import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { processEvent, tickTown } from "./engine";
import { createSession, createWorld, synchronizeWorld } from "./world";
import { MAX_RESIDENT_ACTORS, residentSources } from "./residents";
import { OverlayPopulationProjector } from "../overlay/population";
import { OverlayPlayback } from "../overlay/playback";
import { defaultDisplay, offlineActivity, overlayWorld } from "../overlay/model";

function fixture(count: number) {
  let state = createSession(createWorld({ id: "density-demo", streamerTwitchUserId: "synthetic-owner", seed: 42, name: "Density", mayorName: "Mochi" }));
  for (let i = 0; i < count; i++) state = processEvent(state, { id: `test-event-${i}`, townId: state.world.id, occurredAt: 0,
    type: "NEW_SUBSCRIBER", user: { twitchUserId: `synthetic-user-${i}`, displayName: "Identical display names" } }).state;
  return state.world;
}

for (const count of [0, 12, 30, 60, 100, 200]) test(`adaptive density: ${count} residents in Overview and both OBS modes`, (t) => {
  const world = fixture(count), before = JSON.stringify(world), loaded = createSession(world);
  const sources = residentSources(world);
  assert.equal(sources.length, count);
  assert.equal(loaded.runtime.residentActors.length, count);
  assert.equal(new Set(sources.map((source) => source.id)).size, count);
  const occupiedDistricts = new Set(world.residents.map((r) => world.plots.find((p) => p.buildingId === r.houseId)!.districtId));
  assert.deepEqual(new Set(sources.map((source) => source.districtId)), occupiedDistricts);
  assert.deepEqual(loaded.runtime.residentActors.map((a) => a.actor.nodeId), sources.map((source) => source.nodeId));
  const started = performance.now();
  let state = loaded;
  for (let time = 100; time <= 10000; time += 100) state = tickTown(state, time);
  t.diagnostic(`${count} actors, 100 model ticks: ${(performance.now() - started).toFixed(1)} ms (CPU only; not an OBS FPS benchmark)`);
  assert.equal(state.world, world);
  const refreshed = synchronizeWorld(state, structuredClone(world));
  assert.equal(refreshed.runtime.residentActors, state.runtime.residentActors);
  assert.deepEqual(createSession(world).runtime.residentActors, loaded.runtime.residentActors);

  const projector = new OverlayPopulationProjector(), population = projector.project(world);
  assert.deepEqual(projector.project(world), population);
  const serialized = JSON.stringify(population);
  assert.ok(!serialized.includes("synthetic-user") && !serialized.includes("Identical display names"));
  assert.ok(!serialized.includes("synthetic-owner") && !serialized.includes("twitchUserId"));
  for (const mode of ["living-town", "spotlight"] as const) {
    const playback = new OverlayPlayback(world.id);
    const snapshot = { townId: world.id, revision: 1, world: overlayWorld(world), population,
      settings: { ...defaultDisplay, mode }, activity: offlineActivity(), reactions: [] };
    playback.receive(snapshot, 0);
    assert.equal(playback.session!.runtime.residentActors.length, count);
    assert.deepEqual(playback.session!.world.residents, [], "visual roster must not populate private world records");
    playback.tick(100);
    const actors = playback.session!.runtime.residentActors;
    playback.receive({ ...snapshot, world: undefined }, 200);
    assert.equal(playback.session!.runtime.residentActors, actors);
    playback.receive({ ...snapshot, population: new OverlayPopulationProjector().project(world) }, 300);
    assert.ok(playback.session!.runtime.residentActors.every((actor) => actor.actor.nodeId !== "hall"), "server restart rehydrates, never replays arrival");
    assert.deepEqual(playback.session!.runtime.effects, []);
  }
  assert.equal(JSON.stringify(world), before);
});

test("large populations retain a bounded district-balanced sample with deterministic identities", () => {
  const world = fixture(300), sources = residentSources(world);
  assert.equal(sources.length, MAX_RESIDENT_ACTORS);
  assert.deepEqual(sources, residentSources(structuredClone(world)));
  assert.equal(new Set(sources.map((source) => source.id)).size, MAX_RESIDENT_ACTORS);
  const districts = new Set(world.residents.map((r) => world.plots.find((p) => p.buildingId === r.houseId)!.districtId));
  assert.deepEqual(new Set(sources.map((source) => source.districtId)), districts);
  // Many followers do not produce unbounded actors or fictitious house ownership.
  for (let i = 300; i < 10000; i++) world.residents.push({ id: `follower-${i}`, twitchUserId: `sample-${i}`, displayName: "Follower",
    isFollower: true, isSubscriber: false, subscriptionMonths: 0, houseId: null, housingStatus: "none" });
  const state = createSession(world);
  assert.equal(state.runtime.residentActors.length, MAX_RESIDENT_ACTORS);
  assert.equal(state.world.residents.length, 10000);
  assert.equal(new OverlayPopulationProjector().project(world).actors.length, MAX_RESIDENT_ACTORS);
  const unrelated = fixture(0), untouched = JSON.stringify(unrelated);
  const switched = synchronizeWorld(state, { ...unrelated, id: "different-town" });
  assert.deepEqual(switched.runtime.residentActors, []);
  assert.equal(JSON.stringify(unrelated), untouched);
});

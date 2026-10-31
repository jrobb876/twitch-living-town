import assert from "node:assert/strict";
import test from "node:test";
import { processEvent, tickTown } from "./engine";
import { addDistrict, availablePlots } from "./expansion";
import { neighborhoodCount, neighborhoodLabel } from "./population";
import { MAX_RESIDENT_ACTORS, reconcileResidents } from "./residents";
import { createSession, createWorld, housesIn, synchronizeWorld } from "./world";
import type { TownSession } from "./types";

const initial = (id = "town-a") => createSession(createWorld({ id, streamerTwitchUserId: `owner-${id}`, seed: 42, name: "Test", mayorName: "Mochi" }));
function subscribe(state: TownSession, id: number) {
  return processEvent(state, { id: `sub-${id}`, townId: state.world.id, occurredAt: state.runtime.now, type: "NEW_SUBSCRIBER",
    user: { twitchUserId: String(id), displayName: "Same display name" } }).state;
}

test("twelve cottage allocations preserve appearances; only the thirteenth constructs a home", () => {
  let state = initial();
  const cottages = structuredClone(housesIn(state.world));
  assert.equal(neighborhoodLabel(state.world), "1 Neighborhood");
  for (let i = 1; i <= 12; i++) {
    state = subscribe(state, i);
    assert.equal(housesIn(state.world).length, 12);
    assert.equal(state.world.residents.length, i);
    assert.equal(state.world.residents.at(-1)!.houseId, cottages[i - 1].id);
    assert.equal(availablePlots(state.world), (i < 11 ? 14 : 26) - i);
  }
  const owned = structuredClone(housesIn(state.world));
  state = subscribe(state, 13);
  assert.equal(housesIn(state.world).length, 13);
  assert.deepEqual(housesIn(state.world).slice(0, 12), owned);
  assert.equal(housesIn(state.world).at(-1)!.plotId, "plot-expansion-1");
  assert.deepEqual(housesIn(state.world).slice(0, 12).map((h) => h.appearance), cottages.map((h) => h.appearance));
});

test("conceptual neighborhoods count confirmed expansions, without changing technical subdivisions", () => {
  const original = initial().world;
  assert.equal(original.districts.length, 8);
  let world = original;
  for (let i = 1; i <= 5; i++) {
    world = addDistrict(world)!;
    assert.equal(neighborhoodCount(world), i + 1);
    assert.equal(neighborhoodLabel(world), `${i + 1} Neighborhoods`);
    assert.equal(world.districts.length, 8 + i);
  }
  assert.equal(neighborhoodCount(original), 1, "uninstalled plans cannot change the current count");
  let deferred = initial();
  for (let i = 0; i < 11; i++) deferred = processEvent(deferred, { id: `deferred-${i}`, townId: deferred.world.id,
    occurredAt: 0, type: "NEW_SUBSCRIBER", user: { twitchUserId: String(i), displayName: "Synthetic" } }, 0, { allowExpansion: false }).state;
  assert.equal(neighborhoodCount(deferred.world), 1);
});

test("hydrated residents resume without arrival effects; synchronization preserves motion and removes stale/duplicate actors", () => {
  const saved = subscribe(subscribe(initial(), 1), 2).world;
  const before = JSON.stringify(saved);
  const loaded = createSession(saved, 1000);
  assert.equal(loaded.runtime.residentActors.length, 2);
  assert.ok(loaded.runtime.residentActors.every((r) => r.actor.nodeId !== "hall"));
  assert.deepEqual(loaded.runtime.effects, []);
  assert.deepEqual(loaded.runtime.mayor.tasks, []);
  const moving = tickTown(loaded, 1200);
  const same = synchronizeWorld(moving, structuredClone(saved));
  assert.equal(same.runtime.residentActors, moving.runtime.residentActors);
  assert.equal(same.runtime.mayor, moving.runtime.mayor);
  const newcomer = subscribe(createSession(saved), 3);
  assert.ok(newcomer.runtime.effects.some((e) => e.kind === "housewarming"));
  const updated = synchronizeWorld(same, newcomer.world);
  assert.equal(updated.runtime.residentActors[0], same.runtime.residentActors[0]);
  assert.equal(updated.runtime.residentActors[2].actor.nodeId, "hall", "new record in an existing view enters normally");
  assert.deepEqual(updated.runtime.effects, [], "world synchronization never fabricates events");
  const removed = structuredClone(updated.world); removed.residents.splice(0, 1);
  const dirty = { ...updated, runtime: { ...updated.runtime, residentActors: [...updated.runtime.residentActors, updated.runtime.residentActors[1]] } };
  const cleaned = synchronizeWorld(dirty, removed);
  assert.deepEqual(cleaned.runtime.residentActors.map((r) => r.residentId), removed.residents.map((r) => r.id));
  assert.equal(JSON.stringify(saved), before, "actor reconciliation never mutates the saved world");
});

test("resident actor cap, town identity and demo isolation survive population reconciliation", () => {
  let demo = initial("demo");
  for (let i = 1; i <= 30; i++) demo = subscribe(demo, i);
  const saved = subscribe(initial("saved"), 1);
  const prior = JSON.stringify(saved);
  const reloaded = createSession(demo.world);
  assert.equal(reloaded.world.residents.length, 30);
  assert.equal(reloaded.runtime.residentActors.length, Math.min(30, MAX_RESIDENT_ACTORS));
  const changed = synchronizeWorld(reloaded, saved.world);
  assert.equal(changed.runtime.residentActors.length, 1);
  assert.equal(changed.runtime.residentActors[0].residentId, saved.world.residents[0].id);
  assert.ok(!changed.runtime.residentActors.some((actor) => reloaded.runtime.residentActors.includes(actor)));
  const clipped = structuredClone(demo.world); clipped.residents.shift();
  const actors = reconcileResidents(clipped, 0, reloaded.runtime.residentActors, demo.world);
  assert.equal(actors.length, Math.min(29, MAX_RESIDENT_ACTORS));
  assert.equal(actors.at(-1)!.actor.nodeId === "hall", false, "an established resident entering the visible cap is not a newcomer");
  assert.equal(JSON.stringify(saved), prior);
});

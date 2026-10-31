import assert from "node:assert/strict";
import test from "node:test";
import { addDistrict, availablePlots, districtCell } from "./expansion";
import { createSession, createWorld, housesIn } from "./world";
import { processEvent, tickTown } from "./engine";
import { routeBetween } from "./behavior";
import { MAX_PLOTS, PLANNING } from "../town/planning";
import { validateWorld } from "../persistence/validation";
import type { TownSession } from "./types";

const world = (seed = 42) => createWorld({ id: "00000000-0000-4000-8000-000000000001", streamerTwitchUserId: "123", seed, name: "Test", mayorName: "Mochi" });
function subscribe(state: TownSession, id: number, allowExpansion = true) {
  return processEvent(state, { id: `subscription-${id}`, townId: state.world.id, occurredAt: 0,
    type: "NEW_SUBSCRIBER", user: { twitchUserId: String(id), displayName: `Subscriber ${id}` } }, 0, { allowExpansion }).state;
}

test("districts are deterministic, append-only, distinct across seeds, and expand in several directions", () => {
  const original = world(), before = structuredClone(original), a = addDistrict(original)!;
  assert.deepEqual(original, before); assert.deepEqual(a, addDistrict(world()));
  assert.notDeepEqual(a.layout.trees, addDistrict(world(43))!.layout.trees);
  assert.deepEqual(a.plots.slice(0, 14), original.plots);
  assert.deepEqual(a.layout.roads.slice(0, original.layout.roads.length), original.layout.roads);
  assert.deepEqual(a.districts.slice(0, original.districts.length), original.districts);
  assert.deepEqual(a.layout.navigation.slice(0, original.layout.navigation.length).map(({ id, x, y }) => ({ id, x, y })),
    original.layout.navigation.map(({ id, x, y }) => ({ id, x, y })));
  const cells = Array.from({ length: 40 }, (_, i) => districtCell(i + 1));
  assert.equal(new Set(cells.map((c) => `${c.x},${c.y}`)).size, 40);
  assert.ok(cells.some((c) => c.x < 0) && cells.some((c) => c.y < 0));
});

test("four free plots do not expand; the next allocation adds twelve and retries remain idempotent", () => {
  let state = createSession(world());
  for (let i = 1; i <= 10; i++) state = subscribe(state, i);
  assert.equal(availablePlots(state.world), 4); assert.equal(state.world.plots.length, 14);
  state = subscribe(state, 11);
  assert.equal(state.world.plots.length, 26); assert.equal(availablePlots(state.world), 15);
  assert.ok(state.runtime.effects.some((e) => e.kind === "neighborhood"));
  assert.ok(state.runtime.mayor.tasks.some((t) => t.nodeId === "neighborhood-1:road:1-2"));
  assert.equal(subscribe(state, 11), state);
  const retry = processEvent(state, { id: "new-sync-id", type: "NEW_SUBSCRIBER", townId: state.world.id, occurredAt: 0,
    user: { twitchUserId: "11", displayName: "Same subscriber" } }).state;
  assert.equal(retry.world.plots.length, 26); assert.equal(retry.world.residents.length, 11);
});

test("several hundred homes preserve property customization, connectivity, uniqueness and bounded actors", (t) => {
  const initial = world(); let state = subscribe(createSession(initial), 1);
  const first = housesIn(state.world).find((h) => h.ownerTwitchUserId === "1")!;
  first.property = { status: "verified_subscriber", size: "small", prestige: 0, customization: { sign: "Keep me", garden: "stones" } };
  const kept = structuredClone(first), start = performance.now();
  for (let i = 2; i <= 360; i++) state = subscribe(state, i);
  t.diagnostic(`360 logical subscribers: ${Math.round(performance.now() - start)} ms, ${JSON.stringify(state.world).length} JSON characters (includes demo ledger).`);
  assert.equal(housesIn(state.world).length, 360); assert.equal(state.runtime.residentActors.length, 256);
  assert.equal(new Set(housesIn(state.world).map((h) => h.plotId)).size, 360);
  assert.deepEqual(housesIn(state.world).find((h) => h.id === kept.id), kept);
  assert.deepEqual(housesIn(state.world).slice(0, 12).map((h) => h.position), housesIn(initial).map((h) => h.position));
  for (const [i, a] of state.world.plots.entries()) {
    assert.ok(routeBetween(state.world.layout.navigation, "hall", a.entranceNodeId).length);
    for (const b of state.world.plots.slice(i + 1)) assert.ok(Math.abs(a.position.x - b.position.x) >= 220 || Math.abs(a.position.y - b.position.y) >= 200);
  }
  const persisted = validateWorld({ ...state.world, processedEvents: [] });
  assert.deepEqual(validateWorld(JSON.parse(JSON.stringify(persisted))), persisted);
  const reloaded = createSession(persisted); assert.equal(reloaded.runtime.residentActors.length, 256);
  assert.doesNotThrow(() => tickTown(reloaded, 2000));
  assert.equal(initial.plots.length, 14, "isolated demo and other towns remain untouched");
});

test("failed/deferred expansion retains membership and retries a waitlisted user without moving homes", () => {
  let state = createSession(world());
  for (let i = 1; i <= 15; i++) state = subscribe(state, i, false);
  assert.equal(state.world.plots.length, 14); assert.equal(state.world.residents[14].housingStatus, "waiting");
  const retry = processEvent(state, { id: "retry-sync", townId: state.world.id, occurredAt: 0, type: "NEW_SUBSCRIBER",
    user: { twitchUserId: "15", displayName: "Waitlisted subscriber" } }).state;
  assert.equal(retry.world.residents.length, 15); assert.equal(retry.world.residents[14].housingStatus, "housed");
  assert.deepEqual(housesIn(retry.world).slice(0, 14), housesIn(state.world));
});

test("planning safety limit stays serializable and waitlists overflow without losing membership", () => {
  let state = createSession(world());
  for (let i = 1; i <= MAX_PLOTS + 1; i++) state = subscribe(state, i);
  assert.equal(state.world.districts.filter((d) => d.generation).length, PLANNING.maxDistricts);
  assert.equal(state.world.plots.length, MAX_PLOTS); assert.equal(state.world.residents.at(-1)?.housingStatus, "waiting");
  assert.equal(addDistrict(state.world), null);
  assert.doesNotThrow(() => validateWorld({ ...state.world, processedEvents: [] }));
});

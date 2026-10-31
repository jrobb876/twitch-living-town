import assert from "node:assert/strict";
import test from "node:test";
import { processEvent } from "./engine";
import { availablePlots } from "./expansion";
import { createSession, createWorld, giftCount, housesIn } from "./world";
import type { TownEvent, TownSession } from "./types";

type Payload = { [K in TownEvent["type"]]: Omit<Extract<TownEvent, { type: K }>, "id" | "townId" | "occurredAt"> }[TownEvent["type"]];
const user = (id: string) => ({ twitchUserId: id, displayName: `Synthetic ${id}` });
const initial = () => createSession(createWorld({ id: "audit-town", streamerTwitchUserId: "audit-owner", seed: 42, name: "Audit", mayorName: "Mochi" }));
function apply(state: TownSession, payload: Payload, id = `audit-${state.world.processedEvents.length}`) {
  return processEvent(state, { ...payload, id, townId: state.world.id, occurredAt: state.runtime.now }).state;
}
function counts(state: TownSession) {
  const { world } = state;
  return {
    residents: world.residents.length, subscribers: world.residents.filter((r) => r.isSubscriber).length,
    houses: housesIn(world).length, owned: housesIn(world).filter((h) => h.ownerTwitchUserId !== null).length,
    expansions: world.districts.filter((d) => d.generation).length, plots: world.plots.length,
    empty: world.plots.filter((p) => !p.buildingId).length, capacity: availablePlots(world), gifts: giftCount(world),
  };
}

test("population audit: lifecycle counters distinguish residents, built homes and allocation capacity", () => {
  let state = initial();
  assert.deepEqual(counts(state), { residents: 0, subscribers: 0, houses: 12, owned: 0, expansions: 0, plots: 14, empty: 2, capacity: 14, gifts: 0 });
  assert.equal(state.world.districts.length, 8); // civic, six starter blocks, two-plot reserve
  state = apply(state, { type: "NEW_FOLLOWER", user: user("follower") });
  const followed = counts(state), effects = state.runtime.effects.length;
  state = apply(state, { type: "NEW_FOLLOWER", user: user("follower") });
  assert.deepEqual(counts(state), followed);
  assert.equal(state.runtime.effects.length, effects);
  assert.equal(followed.capacity, 14);
  state = apply(state, { type: "NEW_SUBSCRIBER", user: user("subscriber") });
  assert.equal(state.world.residents.find((r) => r.twitchUserId === "subscriber")!.isFollower, false);
  state = apply(state, { type: "NEW_SUBSCRIBER", user: user("follower") });
  assert.deepEqual(counts(state), { residents: 2, subscribers: 2, houses: 12, owned: 2, expansions: 0, plots: 14, empty: 2, capacity: 12, gifts: 0 });
  const homes = structuredClone(housesIn(state.world));
  const renewal: Payload = { type: "RESUBSCRIPTION", user: user("follower"), cumulativeMonths: 5 };
  state = apply(state, renewal, "renewal");
  assert.equal(apply(state, renewal, "renewal"), state);
  assert.deepEqual(housesIn(state.world), homes);
  assert.equal(state.world.residents.length, 2);
});

test("population audit: five known gifts upgrade existing people and never house the giver", () => {
  let state = apply(initial(), { type: "NEW_FOLLOWER", user: user("1") });
  state = apply(state, { type: "NEW_SUBSCRIBER", user: user("2") });
  const priorHouse = structuredClone(housesIn(state.world).find((h) => h.ownerTwitchUserId === "2"));
  const gift = { groupId: "five-known", gifter: user("giver") };
  const recipients = ["1", "2", "3", "4", "5"].map(user);
  state = apply(state, { type: "GIFT_SUBSCRIPTION", ...gift, total: 5, recipients }, "batch");
  assert.deepEqual(counts(state), { residents: 5, subscribers: 5, houses: 12, owned: 5, expansions: 0, plots: 14, empty: 2, capacity: 9, gifts: 5 });
  assert.deepEqual(housesIn(state.world).find((h) => h.ownerTwitchUserId === "2"), priorHouse);
  assert.ok(!state.world.residents.some((r) => r.twitchUserId === "giver"));
  const before = counts(state), effectCount = state.runtime.effects.length;
  for (const recipient of recipients) state = apply(state, { type: "NEW_SUBSCRIBER", user: recipient, gift });
  state = apply(state, { type: "GIFT_SUBSCRIPTION", ...gift, total: 5, recipients });
  assert.deepEqual(counts(state), before);
  assert.equal(state.runtime.effects.length, effectCount);
});

test("population audit: unresolved five-gift batches count gifts without inventing recipients", () => {
  const gift: Payload = { type: "GIFT_SUBSCRIPTION", groupId: "unresolved", gifter: null, total: 5, recipients: [] };
  let state = apply(initial(), gift, "batch");
  assert.deepEqual(counts(state), { residents: 0, subscribers: 0, houses: 12, owned: 0, expansions: 0, plots: 14, empty: 2, capacity: 14, gifts: 5 });
  assert.equal(apply(state, gift, "batch"), state);
  // The live adapter supplies independently verified members without inventing a batch correlation.
  for (const id of ["1", "2", "3", "4", "5"]) state = apply(state, { type: "NEW_SUBSCRIBER", user: user(id),
    subscription: { active: true, tier: "1000", isGift: true, verifiedAt: 1, source: "sync" } });
  assert.equal(state.world.residents.length, 5);
  assert.equal(giftCount(state.world), 5);
  assert.deepEqual(state.world.giftGroups[0].recipientIds, []);
  const restored = createSession(JSON.parse(JSON.stringify(state.world)), 1000);
  assert.deepEqual(counts(restored), counts(state));
  assert.deepEqual(restored.runtime.effects, []);
  assert.deepEqual(restored.runtime.mayor.tasks, []);
  assert.equal(restored.runtime.residentActors.length, 5);
});

test("population audit: reserve expansion adds vacant plots, not twelve built houses", () => {
  let state = initial();
  for (let i = 1; i <= 10; i++) state = apply(state, { type: "NEW_SUBSCRIBER", user: user(String(i)) });
  assert.deepEqual(counts(state), { residents: 10, subscribers: 10, houses: 12, owned: 10, expansions: 0, plots: 14, empty: 2, capacity: 4, gifts: 0 });
  state = apply(state, { type: "NEW_SUBSCRIBER", user: user("11") });
  assert.deepEqual(counts(state), { residents: 11, subscribers: 11, houses: 12, owned: 11, expansions: 1, plots: 26, empty: 14, capacity: 15, gifts: 0 });
  for (let i = 12; i <= 14; i++) state = apply(state, { type: "NEW_SUBSCRIBER", user: user(String(i)) });
  assert.equal(housesIn(state.world).length, 14);
  state = apply(state, { type: "NEW_SUBSCRIBER", user: user("15") });
  assert.deepEqual(counts(state), { residents: 15, subscribers: 15, houses: 15, owned: 15, expansions: 1, plots: 26, empty: 11, capacity: 11, gifts: 0 });
});

import assert from "node:assert/strict";
import test from "node:test";
import { generateTown } from "../town/generate";
import { overviewOf } from "../rendering/overview";
import { calculateActivity, recordChat } from "./activity";
import { routeBetween } from "./behavior";
import { simulatorEnabled } from "./config";
import { processEvent, tickTown } from "./engine";
import { InMemoryTownRepository } from "./repository";
import { createSession, createWorld, giftCount, housesIn } from "./world";
import type { TownEvent, TownSession, TwitchIdentity } from "./types";

type Payload = { [K in TownEvent["type"]]: Omit<Extract<TownEvent, { type: K }>, "id" | "townId" | "occurredAt"> }[TownEvent["type"]];
const user = (id: string): TwitchIdentity => ({ twitchUserId: id, displayName: `Neighbor ${id}` });
function session(id = "town-a", seed = 42) {
  return createSession(createWorld({ id, seed, streamerTwitchUserId: `${id}-streamer`, name: "Willowbrook", mayorName: "Mochi" }));
}
function event(state: TownSession, payload: Payload, id = `event-${state.world.processedEvents.length}`): TownEvent {
  return { id, townId: state.world.id, occurredAt: state.runtime.now, ...payload };
}
function apply(state: TownSession, payload: Payload, id?: string) { return processEvent(state, event(state, payload, id)).state; }

test("world model preserves seeded overview houses and JSON round-trips", () => {
  const a = session(), b = session();
  assert.deepEqual(a, b);
  assert.deepEqual(overviewOf(a.world).houses, generateTown(42).houses);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.notDeepEqual(overviewOf(session("town-a", 43).world).houses, overviewOf(a.world).houses);
  assert.equal(a.world.districts.filter((d) => d.kind === "residential").length, 7);
});

test("subscriber gets a reachable existing cottage without relocating any home", () => {
  const before = session();
  const serialized = JSON.stringify(before);
  const after = apply(before, { type: "NEW_SUBSCRIBER", user: user("alice") });
  assert.equal(housesIn(after.world).length, 12);
  assert.deepEqual(housesIn(after.world).slice(1), housesIn(before.world).slice(1));
  assert.deepEqual(housesIn(after.world)[0], { ...housesIn(before.world)[0], ownerTwitchUserId: "alice" });
  const home = housesIn(after.world).find((h) => h.ownerTwitchUserId === "alice")!;
  const plot = after.world.plots.find((p) => p.id === home.plotId)!;
  assert.equal(home.id, after.world.residents[0].houseId);
  assert.deepEqual(home.position, plot.position);
  assert.ok(routeBetween(after.world.layout.navigation, "hall", plot.entranceNodeId).length > 0);
  assert.ok(after.runtime.effects.some((effect) => effect.kind === "housewarming"));
  assert.equal(after.runtime.mayor.tasks[0].nodeId, plot.entranceNodeId);
  assert.equal(JSON.stringify(before), serialized, "processor must not mutate its input");
});

test("subscription retries by ID and by user preserve one resident, house and effect", () => {
  const before = session();
  const input = event(before, { type: "NEW_SUBSCRIBER", user: user("alice") }, "webhook-1");
  const first = processEvent(before, input).state;
  const retry = processEvent(first, input);
  assert.equal(retry.state, first);
  assert.equal(retry.outcome.status, "duplicate");
  const semanticRetry = apply(first, { type: "NEW_SUBSCRIBER", user: user("alice") }, "different-id");
  assert.equal(semanticRetry.world.residents.length, 1);
  assert.equal(housesIn(semanticRetry.world).length, 12);
  assert.equal(semanticRetry.runtime.effects.length, first.runtime.effects.length);
});

test("follower arrives without a house; later subscription upgrades the same resident", () => {
  const first = apply(session(), { type: "NEW_FOLLOWER", user: user("alice") });
  assert.equal(housesIn(first.world).length, 12);
  assert.equal(first.world.residents[0].isFollower, true);
  assert.equal(first.world.residents[0].isSubscriber, false);
  assert.equal(first.runtime.effects[0].kind, "arrival");
  const second = apply(first, { type: "NEW_SUBSCRIBER", user: user("alice") });
  assert.equal(second.world.residents.length, 1);
  assert.equal(second.world.residents[0].isFollower, true);
  assert.equal(second.world.residents[0].isSubscriber, true);
});

test("resubscriptions retain house/customization and use cumulative months", () => {
  const first = apply(session(), { type: "NEW_SUBSCRIBER", user: user("alice") });
  const house = housesIn(first.world).find((h) => h.ownerTwitchUserId === "alice")!;
  house.appearance.decorations = ["flower-box", "welcome-sign"];
  const second = apply(first, { type: "RESUBSCRIPTION", user: user("alice"), cumulativeMonths: 6 });
  const third = apply(second, { type: "RESUBSCRIPTION", user: user("alice"), cumulativeMonths: 3 });
  assert.equal(third.world.residents[0].houseId, house.id);
  assert.equal(third.world.residents[0].subscriptionMonths, 6);
  assert.equal(housesIn(third.world).length, 12);
  assert.deepEqual(housesIn(third.world).find((h) => h.id === house.id)!.appearance, house.appearance);
  assert.ok(third.runtime.effects.some((effect) => effect.kind === "welcome-back"));
});

test("aggregate gifts do not invent recipients; individual deliveries reconcile without double counting", () => {
  const gift = { groupId: "batch-1", gifter: user("giver") };
  let state = apply(session(), { type: "GIFT_SUBSCRIPTION", ...gift, total: 2, recipients: [] });
  assert.equal(housesIn(state.world).length, 12);
  assert.equal(giftCount(state.world), 2);
  state = apply(state, { type: "NEW_SUBSCRIBER", user: user("a"), gift });
  state = apply(state, { type: "NEW_SUBSCRIBER", user: user("b"), gift });
  state = apply(state, { type: "GIFT_SUBSCRIPTION", ...gift, total: 2, recipients: [user("a"), user("b"), user("a")] });
  assert.equal(giftCount(state.world), 2);
  assert.equal(state.world.residents.length, 2);
  assert.equal(housesIn(state.world).length, 12);
  assert.equal(state.runtime.effects.filter((effect) => effect.kind === "gift").length, 1);
  assert.equal(state.runtime.effects.filter((effect) => effect.kind === "housewarming").length, 2);
});

test("individual gifts before aggregate and repeated recipients across batches preserve ownership", () => {
  const gift = { groupId: "batch-1", gifter: user("giver") };
  let state = apply(session(), { type: "NEW_SUBSCRIBER", user: user("a"), gift });
  state = apply(state, { type: "GIFT_SUBSCRIPTION", ...gift, total: 2, recipients: [user("a"), user("b")] });
  state = apply(state, { type: "GIFT_SUBSCRIPTION", groupId: "batch-2", gifter: user("giver"), total: 1, recipients: [user("a")] });
  assert.equal(giftCount(state.world), 3);
  assert.equal(housesIn(state.world).length, 12);
  assert.equal(state.world.residents.length, 2);
  const wrongGifter = processEvent(state, event(state, { type: "GIFT_SUBSCRIPTION", ...gift, gifter: user("imposter"), total: 3, recipients: [] }));
  assert.equal(wrongGifter.outcome.status, "rejected");
  assert.equal(wrongGifter.state, state);
});

test("full towns reuse unclaimed demo homes then expand without duplicates or movement", () => {
  const before = session();
  let state = before;
  for (let index = 0; index < 15; index++) state = apply(state, { type: "NEW_SUBSCRIBER", user: user(`sub-${index}`) });
  assert.equal(housesIn(state.world).length, 15);
  assert.equal(new Set(housesIn(state.world).map((h) => h.ownerTwitchUserId)).size, 15);
  assert.equal(state.world.residents.filter((r) => r.housingStatus === "waiting").length, 0);
  assert.deepEqual(housesIn(state.world).slice(0, 12).map((h) => h.position), housesIn(before.world).map((h) => h.position));
});

test("chat limits one user and identical messages; unique users raise activity which decays", () => {
  let activity = recordChat({ samples: [], score: 0, level: "peaceful" }, "alice", "Hello!", 0);
  activity = recordChat(activity, "alice", "different message", 1000);
  activity = recordChat(activity, "alice", "  HELLO!  ", 11000);
  assert.equal(activity.samples.length, 1);
  activity = recordChat(activity, "alice", "different message", 12000);
  assert.equal(activity.samples.length, 2);
  for (let index = 0; index < 8; index++) activity = recordChat(activity, `viewer-${index}`, "Hello!", 12000);
  assert.equal(activity.level, "lively");
  assert.ok(calculateActivity(activity.samples, 42000).score < activity.score);
  assert.deepEqual(calculateActivity(activity.samples, 72000), { samples: [], score: 0, level: "peaceful" });
});

test("chat retries earn nothing and ticks do not alter durable data", () => {
  const before = session();
  const chat = event(before, { type: "CHAT_MESSAGE", user: user("a"), message: "hello" });
  const state = processEvent(before, chat).state;
  assert.equal(processEvent(state, chat).state.runtime.activity.samples.length, 1);
  const ticked = tickTown(state, 60001);
  assert.equal(ticked.runtime.activity.score, 0);
  assert.equal(ticked.world, state.world);
  assert.equal(state.world.buildings, before.world.buildings);
});

test("raid is temporary at Town Hall and creates no permanent population or property", () => {
  const before = session();
  const state = apply(before, { type: "INCOMING_RAID", raider: user("raider"), viewers: 50 });
  assert.deepEqual(state.world.buildings, before.world.buildings);
  assert.equal(state.world.residents.length, 0);
  assert.equal(state.runtime.effects[0].kind, "raid");
  assert.deepEqual(state.runtime.effects[0].position, state.world.layout.hall);
  assert.equal(state.runtime.mayor.tasks[0].nodeId, "hall");
  const after = tickTown(state, 20001);
  assert.equal(after.runtime.effects.length, 0);
  assert.equal(after.runtime.mayor.tasks.length, 0);
});

test("Mayor approaches a new house, celebrates and returns to wandering without PixiJS", () => {
  let state = apply(session(), { type: "NEW_SUBSCRIBER", user: user("a") });
  const destination = state.runtime.mayor.tasks[0].nodeId;
  let sawCelebration = false, sawWandering = false;
  for (let now = 100; now < 100000; now += 100) {
    state = tickTown(state, now);
    if (state.runtime.mayor.behavior === "celebrating") {
      assert.equal(state.runtime.mayor.nodeId, destination); sawCelebration = true;
    }
    if (sawCelebration && state.runtime.mayor.behavior === "wandering") { sawWandering = true; break; }
  }
  assert.ok(sawCelebration); assert.ok(sawWandering);
});

test("activity increases resident and Mayor travel speed", () => {
  let peaceful = apply(session(), { type: "NEW_FOLLOWER", user: user("a") });
  peaceful.runtime.mayor.restUntil = 0;
  let lively = structuredClone(peaceful);
  for (let index = 0; index < 8; index++) lively = apply(lively, { type: "CHAT_MESSAGE", user: user(`chatter-${index}`), message: "hi" });
  const origin = peaceful.runtime.residentActors[0].actor.position;
  peaceful = tickTown(peaceful, 100); lively = tickTown(lively, 100);
  const distance = (p: { x: number; y: number }) => Math.hypot(p.x - origin.x, p.y - origin.y);
  assert.ok(distance(lively.runtime.residentActors[0].actor.position) > distance(peaceful.runtime.residentActors[0].actor.position));
  assert.notDeepEqual(lively.runtime.mayor.position, peaceful.runtime.mayor.position);
});

test("town identity scopes events and in-memory saves are isolated copies", () => {
  const a = session("a"), b = session("b");
  const input = event(a, { type: "NEW_SUBSCRIBER", user: user("same-user") }, "same-delivery");
  const changed = processEvent(a, input).state;
  assert.equal(processEvent(b, input).outcome.status, "rejected");
  assert.equal(processEvent(b, { ...input, townId: "b" }).outcome.status, "applied");
  assert.equal(b.world.residents.length, 0);
  const repo = new InMemoryTownRepository(); repo.save(changed.world); repo.save(b.world);
  const loaded = repo.load("a")!; loaded.residents[0].displayName = "Mutated copy";
  assert.notEqual(repo.load("a")!.residents[0].displayName, "Mutated copy");
  assert.equal(repo.load("b")!.residents.length, 0);
  assert.equal(repo.load("missing"), null);
  const restored = createSession(repo.load("a")!);
  assert.equal(processEvent(restored, input).outcome.status, "duplicate");
  assert.equal(restored.runtime.effects.length, 0, "ephemeral effects are not replayed on load");
});

test("invalid counts and backwards clocks reject without mutation", () => {
  const state = session();
  const invalid = event(state, { type: "INCOMING_RAID", raider: user("a"), viewers: -1 });
  assert.equal(processEvent(state, invalid).state, state);
  assert.equal(processEvent(state, invalid).outcome.status, "rejected");
  assert.equal(tickTown(state, -1), state);
});

test("simulator is off in production unless the build explicitly authorizes demo mode", () => {
  assert.equal(simulatorEnabled("development", undefined), true);
  assert.equal(simulatorEnabled("production", undefined), false);
  assert.equal(simulatorEnabled("production", "false"), false);
  assert.equal(simulatorEnabled("production", "true"), true);
  assert.equal(simulatorEnabled("production", "1"), false);
});

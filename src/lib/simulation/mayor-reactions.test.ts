import assert from "node:assert/strict";
import test from "node:test";
import { createSession, createWorld, housesIn } from "./world";
import { processEvent } from "./engine";
import type { TownEvent } from "./types";
import { advanceReactions, emptyReactions, MAX_REACTION_QUEUE, normalizeReaction, reactionFromEffect, type ReactionCue, type ReactionKind } from "../mayor/reactions";
import { reactionPose, reactionParticle, MAX_REACTION_PARTICLES, REACTION_BOUNDS } from "../mayor/reaction-pose";
import { mayorLooks, personalityFor } from "../mayor/presets";
import { drawMayor } from "../rendering/draw-town";
import { attachMayorReaction } from "../rendering/mayor-reaction";
import { OverlayPlayback } from "../overlay/playback";
import { defaultDisplay, offlineActivity, overlayWorld, spotlightComposition } from "../overlay/model";
import { startPreview, previewReactions } from "../overlay/preview-runtime";
import { createExpandedPreview, previewEnabled } from "../overlay/preview";
import type { TownRenderer } from "../rendering/create-renderer";

const world = () => createWorld({ id: "reactions", streamerTwitchUserId: "12345", name: "Test", mayorName: "Mochi", seed: 42 });
const user = { twitchUserId: "777", displayName: "Private identity" };
const base = { id: "event", townId: "reactions", occurredAt: 0 };
const cue = (kind: ReactionKind, id: string = kind): ReactionCue => ({ id, kind, position: { x: 800, y: 500 }, expiresAt: 30000 });
const reactions = (event: TownEvent, initial = createSession(world())) => processEvent(initial, event).state.runtime.effects.flatMap((effect) => {
  const reaction = reactionFromEffect(effect); return reaction ? [reaction] : [];
});

test("verified event metadata distinguishes all five reactions without leaking names or inventing gift recipients", () => {
  assert.equal(reactions({ ...base, type: "NEW_SUBSCRIBER", user })[0].kind, "subscriber");
  assert.equal(reactions({ ...base, type: "NEW_FOLLOWER", user })[0].kind, "follower");
  const member = processEvent(createSession(world()), { ...base, type: "NEW_SUBSCRIBER", user }).state;
  member.runtime.effects = [];
  assert.deepEqual(reactions({ ...base, id: "another-delivery", type: "NEW_SUBSCRIBER", user }, member), []);
  assert.deepEqual(reactions({ ...base, id: "existing-follows", type: "NEW_FOLLOWER", user }, member), []);
  const resub: TownEvent = { ...base, id: "resub", type: "RESUBSCRIPTION", user, cumulativeMonths: 8 };
  assert.equal(reactions(resub, member)[0].kind, "resubscription");
  const renewed = processEvent(member, resub).state;
  assert.equal(renewed.world.residents.length, 1); assert.equal(renewed.world.residents[0].houseId, member.world.residents[0].houseId);
  const recipient: TownEvent = { ...base, type: "NEW_SUBSCRIBER", user, subscription: { active: true, tier: "1000", isGift: true, source: "eventsub", verifiedAt: 0 } };
  assert.equal(reactions(recipient)[0].kind, "gift-recipient");
  assert.ok(!JSON.stringify(reactions(recipient)).includes(user.displayName));
  const batch: TownEvent = { ...base, type: "GIFT_SUBSCRIPTION", total: 5, recipients: [], gifter: user, groupId: "batch" };
  const gifted = processEvent(createSession(world()), batch).state;
  const giftReaction = reactionFromEffect(gifted.runtime.effects[0])!;
  assert.equal(giftReaction.kind, "gift"); assert.equal(giftReaction.quantity, 5); assert.match(giftReaction.label, /5 gifts/);
  assert.equal(gifted.world.residents.length, 0); assert.equal(housesIn(gifted.world).filter((h) => h.ownerTwitchUserId).length, 0);
  assert.ok(!JSON.stringify(giftReaction).includes(user.displayName));
});

test("historical imports, sync, duplicate deliveries and stale evidence do not replay Mayor reactions", () => {
  const first: TownEvent = { ...base, type: "NEW_SUBSCRIBER", user };
  const state = processEvent(createSession(world()), first).state;
  assert.deepEqual(processEvent(state, first).state, state);
  assert.deepEqual(createSession(state.world).runtime.effects, []);
  assert.deepEqual(processEvent(createSession(world()), first, 0, { historical: true, allowExpansion: true }).state.runtime.effects, []);
  assert.deepEqual(reactions({ ...first, subscription: { source: "sync", active: true, tier: "1000", isGift: false, verifiedAt: 0 } }), []);
  let queue = advanceReactions(undefined, [cue("subscriber")], 100);
  queue = advanceReactions(queue, [cue("subscriber")], 5000); assert.equal(queue.active, null);
  queue = advanceReactions(queue, [{ ...cue("gift"), expiresAt: 2000 }], 6000); assert.equal(queue.active, null);
});

test("gift-only burst coalescing does not suppress unrelated subscriptions, and batches have highest priority", () => {
  let queue = advanceReactions(undefined, [cue("gift-recipient", "recipient-first")], 100);
  assert.equal(queue.active?.kind, "gift-recipient");
  queue = advanceReactions(queue, [{ ...cue("gift", "batch"), quantity: 5 }, cue("subscriber", "unrelated"), cue("resubscription", "renewal"),
    ...Array.from({ length: 100 }, (_, i) => cue("gift-recipient", `recipient-${i}`))], 200);
  assert.equal(queue.active?.kind, "gift"); assert.equal(queue.active?.quantity, 5);
  assert.deepEqual(queue.pending.map((r) => r.kind), ["subscriber", "resubscription"]);
  queue = advanceReactions(queue, [], 5100); assert.equal(queue.active?.id, "unrelated");
  queue = advanceReactions(queue, [], 8400); assert.equal(queue.active?.id, "renewal");
  const reverse = advanceReactions(undefined, [cue("gift-recipient"), cue("gift")], 100);
  assert.equal(reverse.active?.kind, "gift"); assert.equal(reverse.pending.length, 0);
});

test("queue, dedup and continuous playback remain bounded and force a walking break", () => {
  let queue = advanceReactions(undefined, Array.from({ length: 1000 }, (_, i) => cue("subscriber", `event-${i}`)), 100);
  assert.ok(queue.seen.length <= 512); assert.ok(queue.pending.length <= MAX_REACTION_QUEUE);
  queue = advanceReactions(undefined, Array.from({ length: 10 }, (_, i) => cue("subscriber", `burst-${i}`)), 100);
  for (let now = 200; now <= 12100; now += 100) queue = advanceReactions(queue, [], now);
  assert.equal(queue.active, null); assert.equal(queue.restUntil, 14100);
  queue = advanceReactions(queue, [cue("gift", "late")], 12200); assert.equal(queue.active, null);
  queue = advanceReactions(queue, [], 14100); assert.equal(queue.active?.kind, "gift");
  assert.equal(advanceReactions(queue, [], 100000).seen.length, 0);
});

test("all four graphics support distinct bounded poses, personality variation and reduced motion with cleanup", () => {
  const poses = new Set<string>();
  for (const look of mayorLooks) {
    const view = drawMayor(look), graphics = attachMayorReaction(view);
    const children = view.mayor.children.length;
    for (const kind of previewReactions) {
      const active = { ...normalizeReaction(cue(kind)), startedAt: 0, until: 5000 };
      graphics.update(active, 750, personalityFor("playful"), false);
      poses.add(JSON.stringify(reactionPose(active, 750, personalityFor("playful"))));
      const reduced = reactionPose(active, 750, personalityFor("playful"), true);
      assert.equal(reduced.x, 0); assert.equal(reduced.y, 0); assert.equal(reduced.rotation, 0); assert.equal(reduced.particles, 0);
      assert.equal(view.mayor.children.length, children);
    }
    graphics.update(null, 6000, undefined, false); assert.equal(view.leftPaw.rotation, 0); assert.equal(view.rightPaw.rotation, 0); assert.equal(view.body.x, 0);
    view.mayor.destroy({ children: true }); assert.ok(view.mayor.destroyed);
  }
  assert.equal(poses.size, 5);
  const active = { ...normalizeReaction(cue("subscriber")), startedAt: 0, until: 3200 };
  assert.notEqual(reactionPose(active, 750, personalityFor("calm")).y, reactionPose(active, 750, personalityFor("playful")).y);
  assert.equal(reactionPose(active, 3300).alpha, 0);
  for (let i = 0; i < MAX_REACTION_PARTICLES; i++) for (let age = 0; age < 5; age += 0.1) {
    const p = reactionParticle(i, age, true); assert.ok(p.x >= -35 && p.x <= 35 && p.y >= -72 && p.y <= -24);
  }
});

for (const mode of ["living-town", "spotlight"] as const) test(`${mode}: shared playback pauses at current position, resumes, rejects replay and never changes housing`, () => {
  const playback = new OverlayPlayback("reactions"), original = world();
  const snapshot = { townId: original.id, revision: 1, world: overlayWorld(original), settings: { ...defaultDisplay, mode, background: "transparent" as const }, activity: offlineActivity(), reactions: [] as ReactionCue[] };
  playback.receive(snapshot, 0);
  playback.tick(2000); const position = { ...playback.session!.runtime.mayor.position };
  const next = { ...snapshot, reactions: [{ ...cue("gift"), quantity: 7 }] };
  playback.receive(next, 2100); assert.equal(playback.tick(2200)?.kind, "gift");
  const saved = JSON.stringify(playback.session!.world);
  playback.tick(2500); assert.deepEqual(playback.session!.runtime.mayor.position, position);
  assert.equal(playback.session!.runtime.reactionPlayback?.active?.quantity, 7);
  playback.tick(7200); playback.tick(7500); assert.notDeepEqual(playback.session!.runtime.mayor.position, position);
  assert.equal(JSON.stringify(playback.session!.world), saved);
  playback.receive(next, 7600); assert.equal(playback.tick(7700), null);
  const refreshed = new OverlayPlayback(original.id); refreshed.receive(next, 8000); assert.equal(refreshed.tick(8100), null);
  playback.unavailable(); assert.equal(playback.session!.runtime.reactionPlayback?.active, null); playback.clear(); assert.equal(playback.session, null);
});

test("Spotlight effect envelope fits both sides and transparent backgrounds at 1920x1080 and smaller sizes", () => {
  for (const [width, height] of [[1920, 1080], [1280, 720], [640, 360], [360, 640]]) for (const side of ["left", "right"] as const) for (const scale of [0.5, 1, 1.5]) {
    const view = spotlightComposition(width, height, { ...defaultDisplay, mode: "spotlight", background: "transparent", side, scale });
    assert.equal(view.showTown, false);
    assert.ok(view.x + REACTION_BOUNDS.left * view.scale >= 0 && view.x + REACTION_BOUNDS.right * view.scale <= width);
    assert.ok(view.y + REACTION_BOUNDS.top * view.scale >= 0 && view.y + REACTION_BOUNDS.bottom * view.scale <= height);
  }
});

test("authorized preview reactions affect only transient state, stop on disposal and cannot target a saved town", async () => {
  const preview = createExpandedPreview(25, 42), saved = JSON.stringify(preview);
  let now = 0, tick = () => {}, current = createSession(preview);
  const renderer = { update: (state) => { current = state; }, destroy() {}, setDisplay() {}, zoom() {}, pan() {}, reset() {}, focusEvent() {} } satisfies TownRenderer;
  const owner = startPreview(preview, defaultDisplay, async () => renderer, (fn) => { tick = fn; return () => {}; }, () => now);
  await owner.ready;
  for (const kind of previewReactions) { owner.react(kind); now += 100; tick(); now += 16000; tick(); }
  assert.equal(JSON.stringify(current.world), saved);
  owner.destroy(); const stopped = current; owner.react("gift"); now++; tick(); assert.equal(current, stopped);
  assert.throws(() => startPreview(world(), defaultDisplay, async () => renderer));
  assert.equal(previewEnabled({ NODE_ENV: "production", TOWN_DEMO_MODE: "true" }, "localhost:3000"), false);
  assert.deepEqual(emptyReactions().pending, []);
});

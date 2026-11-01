import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createSession, createWorld, housesIn, synchronizeWorld } from "../simulation/world";
import { processEvent, tickTown } from "../simulation/engine";
import type { TownSession } from "../simulation/types";
import { housewarmingCues, housewarmingPose, housewarmingTargets, HOUSEWARMING_MS, MAX_HOUSEWARMINGS } from "./housewarming";
import { OverlayPlayback } from "../overlay/playback";
import { defaultDisplay, offlineActivity, overlayWorld } from "../overlay/model";
import { PresentationCursor } from "../simulation/presentation-cursor";
import { reactionFromEffect } from "../mayor/reactions";

const initial = () => createSession(createWorld({ id: "town-a", streamerTwitchUserId: "owner", seed: 42, name: "Town", mayorName: "Mochi" }));
const event = (state: TownSession, id: string) => ({ id, townId: state.world.id, occurredAt: state.runtime.now,
  type: "NEW_SUBSCRIBER" as const, user: { twitchUserId: id, displayName: `Neighbor ${id}` } });

test("housewarming identifies the actual existing cottage and newly constructed home without changing allocation", () => {
  let state = initial(); const original = new Set(housesIn(state.world).map((h) => h.id));
  for (let i = 0; i < 13; i++) {
    const input = event(state, `sub-${i}`), result = processEvent(state, input);
    const cue = result.state.runtime.effects.find((e) => e.housewarming?.displayName === input.user.displayName)!;
    assert.ok(cue); assert.equal(cue.housewarming!.houseId, result.outcome.houseIds[0]);
    const house = housesIn(result.state.world).find((h) => h.id === cue.housewarming!.houseId)!;
    assert.equal(house.ownerTwitchUserId, input.user.twitchUserId);
    assert.deepEqual(housewarmingTargets(result.state.world, [cue], 100)[0].position, house.position);
    assert.equal(original.has(house.id), i < 12);
    assert.equal(housewarmingTargets(result.state.world, [cue], 100)[0].label, `New home for ${input.user.displayName}!`);
    state = result.state;
  }
});

test("renewals, duplicates, failed assignments and historical imports cannot invent housewarmings", () => {
  const base = initial(), input = event(base, "first"), assigned = processEvent(base, input).state;
  const expired = tickTown(assigned, 20000);
  assert.equal(processEvent(expired, input).outcome.status, "duplicate");
  assert.deepEqual(processEvent(expired, input).state.runtime.effects, []);
  const renewed = processEvent(expired, { ...input, id: "renew", occurredAt: 20000, type: "RESUBSCRIPTION", cumulativeMonths: 2 }).state;
  assert.equal(renewed.runtime.effects.some((e) => e.housewarming), false);
  assert.ok(renewed.runtime.effects.some((e) => e.reaction?.kind === "resubscription"));
  assert.deepEqual(processEvent(base, input, 0, { allowExpansion: true, historical: true }).state.runtime.effects, []);
  const full = initial(); full.world.plots = [];
  const waiting = processEvent(full, event(full, "waiting"), 0, { allowExpansion: false });
  assert.deepEqual(waiting.outcome.houseIds, []);
  assert.equal(waiting.state.runtime.effects.some((e) => e.housewarming), false);
  assert.equal(processEvent(base, { ...input, townId: "foreign" }).outcome.status, "rejected");
});

test("bulk simulations remain bounded with no sequential backlog; expiry and reload do not replay homes", () => {
  let state = initial();
  for (let i = 0; i < 48; i++) state = processEvent(state, event(state, `bulk-${i}`)).state;
  const targets = housewarmingTargets(state.world, state.runtime.effects, 100);
  assert.equal(targets.length, MAX_HOUSEWARMINGS);
  assert.equal(new Set(targets.map((t) => t.id)).size, MAX_HOUSEWARMINGS);
  assert.ok(state.runtime.effects.length <= 32);
  assert.equal(state.world.residents.length, 48);
  assert.deepEqual(housewarmingTargets(state.world, state.runtime.effects, HOUSEWARMING_MS), []);
  const refreshed = synchronizeWorld(state, structuredClone(state.world));
  assert.deepEqual(housewarmingTargets(refreshed.world, refreshed.runtime.effects, HOUSEWARMING_MS), []);
  assert.deepEqual(createSession(state.world).runtime.effects, []);
  assert.deepEqual(tickTown(state, 20000).runtime.effects, []);
  const cursor = new PresentationCursor(), cues = housewarmingCues(state.runtime.effects, "batch", 15000);
  assert.deepEqual(cursor.take(cues, 0), []); // Opening a view baselines old deliveries.
  assert.deepEqual(cursor.take(cues, 100), []);
});

test("both OBS modes play independent house and Mayor effects once, and preserve them across saved refreshes", () => {
  const base = initial(), state = processEvent(base, event(base, "live")).state;
  const cues = housewarmingCues(state.runtime.effects, "verified", 15000);
  const reactions = state.runtime.effects.flatMap((e) => { const cue = reactionFromEffect(e, "mayor", 15000); return cue ? [cue] : []; });
  assert.equal(cues.length, 1); assert.equal(reactions.length, 1);
  assert.ok(!JSON.stringify(cues).includes("ownerTwitchUserId"));
  for (const mode of ["living-town", "spotlight"] as const) {
    const playback = new OverlayPlayback(base.world.id);
    const snapshot = { townId: base.world.id, revision: 1, settings: { ...defaultDisplay, mode },
      world: overlayWorld(state.world), activity: offlineActivity(), reactions: [], housewarmings: [] };
    playback.receive(snapshot, 0);
    playback.receive({ ...snapshot, reactions, housewarmings: cues }, 100);
    playback.tick(200);
    assert.equal(playback.session!.runtime.mayor.behavior, "celebrating");
    assert.equal(housewarmingTargets(playback.session!.world, playback.session!.runtime.effects, 200).length, 1);
    playback.receive({ ...snapshot, reactions, housewarmings: cues }, 300);
    assert.equal(playback.session!.runtime.effects.filter((e) => e.housewarming).length, 1);
    playback.tick(5100);
    assert.equal(playback.session!.runtime.effects.some((e) => e.housewarming), false);
    playback.unavailable(); playback.receive({ ...snapshot, reactions, housewarmings: cues }, 5200);
    assert.equal(playback.session!.runtime.effects.some((e) => e.housewarming), false);
    const fresh = new OverlayPlayback(base.world.id);
    fresh.receive({ ...snapshot, reactions, housewarmings: cues }, 100);
    assert.deepEqual(fresh.session!.runtime.effects, []);
  }
});

test("housewarming fades with static reduced-motion poses and never enlarges Spotlight captions", async () => {
  assert.equal(housewarmingPose(0, false, false, 1).alpha, 0);
  assert.equal(housewarmingPose(1000, false, false, 1).alpha, 1);
  assert.ok(housewarmingPose(4500, false, false, 1).alpha < 1);
  assert.equal(housewarmingPose(5000, false, false, 1).alpha, 0);
  for (const age of [500, 1000, 3000]) {
    assert.equal(housewarmingPose(age, true, false, 1).lift, 0);
    assert.equal(housewarmingPose(age, true, false, 1).sparkleAlpha, 0.7);
    assert.equal(housewarmingPose(age, true, true, 3).showLabel, false);
  }
  assert.equal(housewarmingPose(1000, false, false, 0.2).showLabel, false);
  // The effect is a world-space child, sharing the house's camera transform.
  const source = await readFile("src/lib/rendering/create-renderer.ts", "utf8");
  assert.match(source, /world.addChild\(effectsLayer\)/);
  assert.match(source, /effectsLayer.addChild\(visual.view\)/);
  assert.match(source, /visual.view.position.set\(target.position.x, target.position.y\)/);
  assert.match(source, /visual.view.destroy\(\{ children: true \}\)/);
  const state = processEvent(initial(), event(initial(), "position")).state;
  const cue = state.runtime.effects.find((e) => e.housewarming)!;
  cue.position = { x: -999, y: -999 }; // Stale payload coordinates never override the actual house.
  const target = housewarmingTargets(state.world, [cue], 100)[0];
  const house = housesIn(state.world).find((h) => h.id === cue.housewarming!.houseId)!;
  for (const [zoom, x, y] of [[0.5, 30, -20], [2, -200, 100]]) {
    assert.deepEqual({ x: target.position.x * zoom + x, y: target.position.y * zoom + y },
      { x: house.position.x * zoom + x, y: house.position.y * zoom + y });
  }
  assert.deepEqual(housewarmingTargets({ ...state.world, buildings: [] }, [cue], 100), []);
});

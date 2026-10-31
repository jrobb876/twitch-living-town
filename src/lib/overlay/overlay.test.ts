import assert from "node:assert/strict";
import test from "node:test";
import { defaultDisplay, displaySchema, overlayWorld, spotlightComposition, offlineActivity } from "./model";
import { OverlayPlayback } from "./playback";
import { ReactionQueue, reactionFromEffect, type OverlayReaction } from "./reactions";
import { createWorld } from "../simulation/world";
import { addDistrict } from "../simulation/expansion";
import { followCamera, smoothCamera, worldBounds, fitCamera } from "../rendering/camera";
import { personalityFor } from "../mayor/presets";
import { houseVisual } from "../houses/customization";
import { fixture } from "../auth/test-fixtures";
import { CHAT_SCOPE } from "../auth/types";
import { ChatManager } from "../chat/manager";
import { NOW, sockets, welcome, settle, chatMessage } from "../chat/test-fixtures";

const makeWorld = () => createWorld({ id: "town-a", streamerTwitchUserId: "12345", seed: 42, name: "Saved town", mayorName: "Nori" });
const snapshot = () => ({ townId: "town-a", revision: 1, settings: defaultDisplay, world: overlayWorld(makeWorld()), activity: offlineActivity(), reactions: [] });
test("overlay projection retains geometry, selected Mayor and public exteriors, without membership/private records", () => {
  const world = addDistrict(makeWorld())!;
  world.mayor.appearance = { preset: "dark" }; world.mayor.personality = personalityFor("calm");
  const house = world.buildings.find((b) => b.kind === "house")!;
  if (house.kind !== "house") throw new Error("missing fixture");
  house.ownerTwitchUserId = "private-owner";
  house.property = { status: "verified_subscriber", size: "large", prestige: 10, customization: { houseName: "Little home", garden: "herbs", accent: "lantern", privateNote: "never-send" } };
  world.giftGroups = [{ id: "private-gift", gifter: null, recipientIds: ["private-owner"], announcedCount: 1 }];
  const view = overlayWorld(world), projected = view.buildings.find((b) => b.id === house.id)!;
  assert.deepEqual(view.layout, world.layout); assert.deepEqual(view.plots, world.plots); assert.deepEqual(view.districts, world.districts);
  assert.deepEqual(view.mayor, world.mayor); assert.equal(view.mayor.id, world.mayor.id);
  assert.equal(projected.kind, "house"); if (projected.kind === "house") assert.deepEqual(houseVisual(projected), houseVisual(house));
  for (const secret of ["private-owner", "private-gift", "never-send", '"12345"']) assert.ok(!JSON.stringify(view).includes(secret));
  assert.deepEqual(view.residents, []); assert.equal(house.ownerTwitchUserId, "private-owner", "projection must not mutate the saved world");
});
test("follow framing clamps expanded negative bounds, keeps Mayor on screen, and eases without overshoot", () => {
  let world = makeWorld(); for (let i = 0; i < 8; i++) world = addDistrict(world)!;
  const bounds = worldBounds(world); assert.ok(bounds.x < 0 && bounds.y < 0);
  for (const [width, height] of [[1920, 1080], [1280, 720], [640, 360]]) for (const p of world.layout.navigation) {
    const camera = followCamera(bounds, width, height, p);
    assert.ok(camera.x + bounds.x * camera.scale <= 0.01);
    assert.ok(camera.x + (bounds.x + bounds.width) * camera.scale >= width - 0.01);
    assert.ok(camera.y + bounds.y * camera.scale <= 0.01);
    assert.ok(camera.y + (bounds.y + bounds.height) * camera.scale >= height - 0.01);
    assert.ok(p.x * camera.scale + camera.x >= 0 && p.x * camera.scale + camera.x <= width);
    assert.ok(p.y * camera.scale + camera.y >= 0 && p.y * camera.scale + camera.y <= height);
  }
  const small = followCamera({ x: -50, y: -40, width: 100, height: 80 }, 1920, 1080, { x: 0, y: 0 });
  assert.equal(small.x, 960); assert.equal(small.y, 540);
  const smooth = smoothCamera({ x: 0, y: 100 }, { x: 100, y: 0 }, 0.016);
  assert.ok(smooth.x > 0 && smooth.x < 10); assert.ok(smooth.y < 100 && smooth.y > 90);
  assert.deepEqual(smoothCamera(smooth, { x: 100, y: 0 }, 0), smooth);
  assert.ok(fitCamera(bounds, 1920, 1080).scale < fitCamera(worldBounds(makeWorld()), 1920, 1080).scale);
});
test("Spotlight composes both sides, responsive scale, transparent-only mode and bounded preferences", () => {
  for (const [width, height] of [[1920, 1080], [1280, 720], [400, 900]]) {
    const left = spotlightComposition(width, height, { ...defaultDisplay, mode: "spotlight", scale: 1.5 });
    const right = spotlightComposition(width, height, { ...defaultDisplay, mode: "spotlight", side: "right", background: "transparent" });
    assert.ok(left.visible && left.showTown && right.visible && !right.showTown);
    assert.equal(left.x + right.x, width); assert.ok(left.y - 48 * left.scale >= 0);
    assert.ok(left.x - 26 * left.scale > 0); assert.ok(right.x + 33 * right.scale < width);
  }
  assert.ok(spotlightComposition(1920, 1080, { ...defaultDisplay, background: "transparent" }).showTown);
  assert.ok(!spotlightComposition(1920, 1080, defaultDisplay).visible);
  for (const input of [{ ...defaultDisplay, scale: 100 }, { ...defaultDisplay, side: "center" }, { ...defaultDisplay, world: {} }]) assert.equal(displaySchema.safeParse(input).success, false);
});
test("reactions interrupt only for higher priority, deduplicate, expire and clean up to idle", () => {
  const queue = new ReactionQueue(), base: OverlayReaction = { id: "a", kind: "subscriber", position: { x: 10, y: 10 }, expiresAt: 30000 };
  queue.offer([base], 1000); assert.equal(queue.tick(1000)?.id, "a");
  queue.offer([base, { ...base, id: "b", kind: "resubscription" }], 2000); assert.equal(queue.tick(2000)?.id, "a");
  queue.offer([{ ...base, id: "c", kind: "raid" }], 3000); assert.equal(queue.tick(3000)?.id, "c");
  assert.equal(queue.tick(9000)?.id, "b"); assert.equal(queue.tick(15000), null);
  queue.offer([base], 16000); assert.equal(queue.tick(16000), null);
  queue.offer([{ ...base, id: "expired", expiresAt: 100 }], 16000); assert.equal(queue.tick(16000), null);
  queue.offer([{ ...base, id: "cleanup" }], 16000); queue.clear(); assert.equal(queue.tick(16000), null);
  assert.equal(reactionFromEffect({ id: "x", kind: "raid", label: "private label", position: base.position, startedAt: 0, expiresAt: 30000 }, "x", 30000), null, "no live raid integration is invented");
});
test("playback applies chat, preserves runtime across expansion, handles outages/recovery and rejects a different town", () => {
  const playback = new OverlayPlayback("town-a"), first = snapshot();
  first.activity = { ready: true, status: "connected", receivedMessages: 4, sampleAgesMs: [0, 100, 200, 300] };
  playback.receive(first, 1000); assert.ok(playback.session!.runtime.activity.score > 0);
  playback.tick(3000); playback.tick(3200);
  assert.equal(playback.session!.runtime.mayor.behavior, "wandering", "idle reaction queue must not overwrite autonomous behavior");
  const position = { ...playback.session!.runtime.mayor.position };
  playback.receive({ ...first, world: overlayWorld(addDistrict(makeWorld())!), revision: 2 }, 3300);
  assert.deepEqual(playback.session!.runtime.mayor.position, position); assert.equal(playback.session!.world.plots.length, 26);
  playback.receive({ ...first, world: undefined, revision: 2 }, 3400); assert.equal(playback.session!.world.plots.length, 26);
  playback.unavailable(); playback.tick(65000); assert.equal(playback.session!.runtime.activity.score, 0);
  assert.equal(playback.session!.world.plots.length, 26, "outage keeps the last saved geometry");
  assert.throws(() => playback.receive({ ...first, townId: "another" }, 66000));
  playback.clear(); assert.equal(playback.session, null); assert.equal(playback.revision, null);
  playback.receive(first, 67000); assert.equal(playback.session!.world.id, "town-a");
});
test("playback celebrations return to autonomous behavior and do not replay after temporary outages", () => {
  const playback = new OverlayPlayback("town-a");
  playback.receive(snapshot(), 500);
  const reaction: OverlayReaction = { id: "committed-event", kind: "subscriber", position: { x: 800, y: 630 }, expiresAt: 20000 };
  playback.receive({ ...snapshot(), reactions: [reaction] }, 1000);
  assert.equal(playback.tick(1100)?.id, reaction.id); assert.equal(playback.session!.runtime.mayor.behavior, "celebrating");
  assert.equal(playback.session!.runtime.effects.length, 1);
  playback.unavailable(); assert.equal(playback.session!.runtime.effects.length, 0);
  playback.receive({ ...snapshot(), reactions: [reaction] }, 1200);
  assert.equal(playback.tick(1300), null, "an already seen presentation is not replayed after reconnect");
  playback.tick(3000); assert.equal(playback.session!.runtime.mayor.behavior, "wandering");
  playback.receive({ ...snapshot(), reactions: [{ ...reaction, id: "next-event" }] }, 3100);
  playback.tick(3200); playback.tick(9300);
  assert.equal(playback.session!.runtime.effects.length, 0);
  assert.equal(playback.session!.runtime.mayor.celebrationUntil, 0);
  playback.clear(); assert.equal(playback.tick(9400), null);
});

test("OBS refresh baselines old celebrations while parallel views and later events remain independent", () => {
  const a = new OverlayPlayback("town-a"), b = new OverlayPlayback("town-a");
  const old: OverlayReaction = { id: "old", kind: "gift", position: { x: 800, y: 630 }, expiresAt: 20000 };
  for (const view of [a, b]) {
    view.receive({ ...snapshot(), reactions: [old] }, 1000);
    assert.equal(view.tick(1100), null);
  }
  const fresh = { ...old, id: "fresh" };
  for (const view of [a, b]) {
    view.receive({ ...snapshot(), reactions: [old, fresh] }, 1200);
    assert.equal(view.tick(1300)?.id, "fresh");
  }
  const refreshed = new OverlayPlayback("town-a");
  refreshed.receive({ ...snapshot(), reactions: [old, fresh] }, 1400);
  assert.equal(refreshed.tick(1500), null);
  assert.deepEqual(refreshed.session!.runtime.effects, []);
  refreshed.unavailable();
  const next = { ...old, id: "after-reconnect" };
  refreshed.receive({ ...snapshot(), reactions: [fresh, next] }, 2000);
  assert.equal(refreshed.tick(2100)?.id, next.id);
  assert.equal(refreshed.session!.world.residents.length, 0, "visual playback never invents resident records");
});
test("verified EventSub chat reaches the overlay without dashboard polling or leaking chatter identities", async () => {
  const f = fixture(), socket = sockets(); f.twitch.validation.scopes = [CHAT_SCOPE]; const login = await f.login();
  const manager = new ChatManager(f.service, socket.factory, () => NOW, async () => "sub-1");
  try {
    assert.deepEqual(manager.overlayActivity("12345"), offlineActivity());
    await manager.start(login.id); await settle(); socket.opened[0].receive(welcome()); await settle();
    socket.opened[0].receive(chatMessage("real-id", "12345", "private text")); manager.tick();
    const activity = manager.overlayActivity("12345"); assert.ok(activity.ready); assert.equal(activity.receivedMessages, 1);
    assert.deepEqual(manager.overlayActivity("999"), offlineActivity());
    for (const privateValue of ["private text", "12345", "real-id", "test-access", login.id]) assert.ok(!JSON.stringify(activity).includes(privateValue));
    const playback = new OverlayPlayback("town-a"); playback.receive({ ...snapshot(), activity }, NOW);
    assert.ok(playback.session!.runtime.activity.score > 0);
  } finally { manager.dispose(); }
});

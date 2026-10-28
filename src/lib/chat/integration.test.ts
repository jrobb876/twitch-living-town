import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { fixture } from "../auth/test-fixtures";
import { AuthError, CHAT_SCOPE, SESSION_TTL_MS, VALIDATION_INTERVAL_MS } from "../auth/types";
import { cookieNames } from "../auth/config";
import { createChatHandlers } from "./http";
import { ChatManager } from "./manager";
import { LiveChatFeed } from "./feed";
import { mapChatNotification } from "./mapping";
import { liveTownId, type ChatSnapshot } from "./types";
import { createLiveView, projectLiveActivity } from "./projection";
import { calculateActivity } from "../simulation/activity";
import { processEvent, tickTown } from "../simulation/engine";
import { createSession, createWorld } from "../simulation/world";
import { chatMessage, NOW, settle, sockets, welcome } from "./test-fixtures";

const error = (code: string) => (value: unknown) => value instanceof AuthError && value.code === code;
async function setup(scoped = true) {
  const f = fixture(), socket = sockets(), subscriptions: string[][] = [];
  if (scoped) f.twitch.validation.scopes = [CHAT_SCOPE];
  const login = await f.login();
  let clock = NOW;
  const manager = new ChatManager(f.service, socket.factory, () => clock, async (token, userId, sessionId) => {
    subscriptions.push([token, userId, sessionId]); return "sub-1";
  });
  const handlers = createChatHandlers(() => f.service, () => manager, false);
  const request = (id: string | undefined = login.id, init: RequestInit = {}) => new NextRequest(`${f.config.origin}/api/chat/start`, {
    ...init, signal: init.signal ?? undefined,
    headers: { Cookie: id ? `${cookieNames(false).session}=${id}` : "", Origin: f.config.origin, "X-CSRF-Token": f.service.csrfToken(id ?? ""), ...init.headers },
  });
  return { ...f, ...socket, subscriptions, manager, handlers, login, request, advanceChat: (ms: number) => { clock += ms; } };
}

test("chat reauthorization requests only read-chat and rejects omitted scopes or a switched Twitch account", async () => {
  for (const result of ["granted", "missing", "switched"]) {
    const f = fixture(), first = await f.login();
    const attempt = f.service.beginLogin(undefined, "12345"), url = new URL(attempt.location);
    assert.equal(url.searchParams.get("scope"), "user:read:chat");
    if (result !== "missing") f.twitch.validation.scopes = [CHAT_SCOPE];
    if (result === "switched") { f.twitch.identity.twitchUserId = "999"; f.twitch.validation.userId = "999"; }
    const finish = f.service.finishLogin({ state: url.searchParams.get("state")!, code: "code" }, attempt.binding, first.id);
    if (result === "granted") {
      const next = await finish; assert.equal(next.chatRequested, true);
      assert.equal((await f.service.chatSession(next.id)).authorized, true);
      assert.equal(await f.service.getProfile(first.id), null);
    } else await assert.rejects(finish, error("chat_scope"));
  }
});

test("old identity-only sessions need explicit chat authorization; controls require auth, origin and CSRF", async () => {
  const f = await setup(false);
  await assert.rejects(f.manager.start(f.login.id), error("chat_scope"));
  assert.equal(f.opened.length, 0);
  assert.equal((await f.handlers.status(f.request(""))).status, 401);
  const invalidHeaders: Record<string, string>[] = [{ "X-CSRF-Token": "forged" }, { Origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }];
  for (const headers of invalidHeaders) {
    assert.equal((await f.handlers.start(f.request(f.login.id, { method: "POST", headers }))).status, 403);
    assert.equal((await f.handlers.authorize(f.request(f.login.id, { method: "POST", headers }))).status, 403);
  }
  assert.equal((await f.handlers.start(f.request())).status, 403); // GET cannot mutate.
  const response = await f.handlers.authorize(f.request(f.login.id, { method: "POST" }));
  assert.equal(response.status, 200);
  assert.equal(new URL((await response.json()).location).searchParams.get("scope"), CHAT_SCOPE);
  assert.equal(response.cookies.get(cookieNames(false).state)?.httpOnly, true);
});

test("multiple tabs share one socket and subscription; browser-supplied channel IDs never select a target", async () => {
  const f = await setup();
  await Promise.all([f.manager.start(f.login.id), f.manager.start(f.login.id)]); await settle();
  assert.equal(f.opened.length, 1);
  f.opened[0].receive(welcome()); await settle();
  await f.handlers.start(f.request(f.login.id, { method: "POST", body: JSON.stringify({ broadcasterId: "999", townId: "someone-elses-town" }) }));
  await settle();
  assert.deepEqual(f.subscriptions, [["test-access", "12345", "socket-1"]]);
  const response = await f.handlers.status(f.request());
  const snapshot = await response.json();
  assert.equal(snapshot.channel.twitchUserId, "12345"); assert.equal(snapshot.townId, "twitch:12345");
  assert.match(response.headers.get("cache-control")!, /no-store/);
  for (const privateField of ["test-access", "test-refresh", f.login.id, "encryptedTokens", "sessionKey", "sample.message"]) assert.ok(!JSON.stringify(snapshot).includes(privateField));
});

test("another signed-in viewer cannot inspect or disconnect a different broadcaster's connection", async () => {
  const f = await setup(); await f.manager.start(f.login.id); await settle(); f.opened[0].receive(welcome()); await settle();
  f.twitch.identity.twitchUserId = "999"; f.twitch.validation.userId = "999";
  f.twitch.tokens = { accessToken: "other-token", refreshToken: "other-refresh" };
  const a = f.begin();
  const viewer = await f.service.finishLogin({ state: a.state, code: "code" }, a.binding);
  const snapshot = await f.manager.snapshot(viewer.id);
  assert.equal(snapshot.townId, "twitch:999"); assert.equal(snapshot.status, "disconnected");
  await f.manager.stop(viewer.id);
  assert.equal(f.opened[0].closed, false);
  assert.equal((await f.manager.snapshot(f.login.id)).status, "connected");
});

test("session expiry, sign-out, lost scope and EventSub revocation stop live connections", async () => {
  for (const cause of ["expired", "signout", "scope", "revocation"]) {
    const f = await setup(); await f.manager.start(f.login.id); await settle(); f.opened[0].receive(welcome()); await settle();
    if (cause === "expired") f.advance(SESSION_TTL_MS);
    if (cause === "signout") await f.service.signOut(f.login.id, f.service.csrfToken(f.login.id));
    if (cause === "scope") { f.twitch.validation.scopes = []; f.advance(VALIDATION_INTERVAL_MS); await f.service.maintain(); }
    if (cause === "revocation") {
      const message = chatMessage(); message.metadata.message_type = "revocation"; message.payload.subscription.status = "authorization_revoked";
      f.opened[0].receive(message);
      assert.equal(await f.service.getProfile(f.login.id), null);
    }
    f.manager.tick(); assert.equal(f.opened[0].closed, true);
    const count = f.opened.length; f.advanceChat(120_000); f.manager.tick(); await settle(); assert.equal(f.opened.length, count);
  }
});

test("valid Twitch chat maps stable message/chatter IDs and rejects unsupported, malformed and foreign events", () => {
  const input = chatMessage(), mapped = mapChatNotification(input, "12345", NOW)!;
  assert.equal(mapped.id, "twitch:chat:12345:message-1"); assert.equal(mapped.townId, liveTownId("12345"));
  assert.equal(mapped.user.twitchUserId, "111"); assert.equal(mapped.type, "CHAT_MESSAGE");
  assert.equal(mapChatNotification(input, "999", NOW), null);
  assert.equal(mapChatNotification(input, "12345", NOW + 601_000), null);
  for (const mutate of [
    (value: typeof input) => { value.metadata.subscription_type = "channel.follow"; },
    (value: typeof input) => { value.payload.event.chatter_user_id = "not-a-twitch-id"; },
    (value: typeof input) => { value.payload.subscription.condition.user_id = "999"; },
    (value: typeof input) => { value.payload.event.message.text = ""; },
    (value: typeof input) => { value.metadata.message_timestamp = "invalid"; },
  ]) {
    const value = structuredClone(input); mutate(value); assert.equal(mapChatNotification(value, "12345", NOW), null);
  }
  assert.equal(mapChatNotification(null, "12345", NOW), null);
});

test("opaque Twitch delivery/message IDs preserve exact identity and accept broadcaster chat", () => {
  const feed = new LiveChatFeed("12345", NOW);
  const input = chatMessage("message:synthetic/+==", "12345");
  input.metadata.message_id = "delivery:synthetic/+==";
  const mapped = mapChatNotification(input, "12345", NOW);
  assert.equal(mapped?.id, "twitch:chat:12345:message:synthetic/+==");
  assert.equal(feed.receive(input, NOW), true);
  const duplicate = structuredClone(input); duplicate.metadata.message_id = "another.delivery";
  assert.equal(feed.receive(duplicate, NOW + 100), false);
  assert.equal(feed.receivedMessages, 1);
  for (const bad of [null, 12, {}, "", "   ", "id\nvalue", "id\u0000value", "x".repeat(4097)]) {
    for (const target of ["metadata", "event"] as const) {
      const malformed = structuredClone(input);
      const field: Record<string, unknown> = target === "metadata" ? malformed.metadata : malformed.payload.event;
      field.message_id = bad;
      assert.equal(mapChatNotification(malformed, "12345", NOW), null);
    }
  }
});

test("disconnect/reconnect preserves deduplication and isolates two broadcaster feeds", async () => {
  const f = await setup(); await f.manager.start(f.login.id); await settle();
  f.opened[0].receive(welcome()); await settle(); f.opened[0].receive(chatMessage());
  await f.manager.stop(f.login.id); assert.equal(f.opened[0].closed, true);
  assert.ok(await f.service.getProfile(f.login.id));
  await f.manager.start(f.login.id); await settle(); f.opened[1].receive(welcome("socket-2")); await settle();
  f.opened[1].receive(chatMessage("message-1", "111", "Lovely town!", "12345", NOW, "socket-2"));
  assert.equal((await f.manager.snapshot(f.login.id)).receivedMessages, 1);
  const other = new LiveChatFeed("999", NOW);
  assert.equal(other.receive(chatMessage(), NOW), false);
  assert.equal(other.receive(chatMessage("message-1", "111", "Hi", "999"), NOW), true);
  assert.equal(other.snapshot(NOW).receivedMessages, 1);
  f.manager.dispose(); assert.equal(f.opened[1].closed, true);
});

test("token refresh retains chat scope and subsequent socket recovery uses the rotated token", async () => {
  const f = await setup(); f.twitch.validation.expiresIn = 1;
  await f.manager.start(f.login.id); await settle(); f.opened[0].receive(welcome()); await settle();
  f.advance(1000);
  f.twitch.validate = async (token) => {
    if (token === "test-access") throw new AuthError("invalid_token");
    return { ...f.twitch.validation, expiresIn: 7200 };
  };
  await f.service.maintain();
  assert.equal((await f.manager.snapshot(f.login.id)).authorized, true);
  f.opened[0].disconnect(); f.advanceChat(2000); f.manager.tick(); await settle();
  f.opened[1].receive(welcome("socket-2")); await settle();
  assert.equal(f.subscriptions[1][0], "rotated-access");
  assert.equal((await f.manager.snapshot(f.login.id)).status, "connected");
});

test("live feed deduplicates Twitch IDs, preserves spam rules, fades and retains no readable chat", () => {
  const feed = new LiveChatFeed("12345", NOW), input = chatMessage("id", "111", "Some private text");
  assert.equal(feed.receive(input, NOW), true);
  const retry = structuredClone(input); retry.metadata.message_id = "different-delivery";
  assert.equal(feed.receive(retry, NOW + 100), false);
  feed.receive(chatMessage("rapid", "111", "different text", "12345", NOW + 100), NOW + 100);
  feed.receive(chatMessage("repeat", "111", " SOME   PRIVATE TEXT ", "12345", NOW + 11_000), NOW + 11_000);
  assert.equal(feed.snapshot(NOW + 11_000).sampleAgesMs.length, 1);
  assert.equal(feed.receivedMessages, 3);
  assert.ok(!JSON.stringify(feed).includes("Some private text"));
  assert.ok(!JSON.stringify(feed).includes("some private text"));
  assert.equal(feed.snapshot(NOW + 60_000).sampleAgesMs.length, 0);
  assert.equal(feed.receive(chatMessage("foreign", "111", "hi", "999"), NOW + 60_000), false);
});

test("live activity drives existing Mayor/ambient behavior without creating residents or touching demo state", () => {
  const feed = new LiveChatFeed("12345", NOW);
  for (let i = 0; i < 8; i++) feed.receive(chatMessage(`id-${i}`, `${100 + i}`), NOW);
  const snapshot: ChatSnapshot = { channel: { twitchUserId: "12345", login: "neighbor", displayName: "Neighbor" }, townId: "twitch:12345",
    authorized: true, status: "connected", socketConnected: true, subscriptionReady: true, csrfToken: "synthetic", ...feed.snapshot(NOW) };
  const live = createLiveView(snapshot, 42, "Town", "Mochi", 0), lively = projectLiveActivity(live, snapshot);
  const demo = createSession(createWorld({ id: "demo-willowbrook", streamerTwitchUserId: "sim-streamer", seed: 42, name: "Town", mayorName: "Mochi" }));
  assert.equal(projectLiveActivity(demo, snapshot), demo);
  assert.equal(lively.runtime.activity.level, "lively"); assert.equal(lively.runtime.activity.score, 80);
  assert.equal(lively.world, live.world); assert.equal(lively.world.residents.length, 0); assert.equal(lively.world.buildings.filter((b) => b.kind === "house").length, 12);
  assert.equal(lively.runtime.residentActors.length, 4);
  const simulated = processEvent(demo, { type: "CHAT_MESSAGE", id: "sim-event", townId: demo.world.id, occurredAt: 0, user: { twitchUserId: "sim-1", displayName: "Demo" }, message: "hi" }).state;
  assert.equal(simulated.runtime.activity.score, 10); assert.equal(lively.runtime.activity.score, 80);
  assert.equal(tickTown(lively, 60_000).runtime.activity.score, 0);
  assert.equal(calculateActivity(lively.runtime.activity.samples, 30_000).score, 40);
  let quiet = live, active = lively;
  for (let time = 100; time <= 5000; time += 100) { quiet = tickTown(quiet, time); active = tickTown(active, time); }
  assert.notDeepEqual(active.runtime.mayor.position, quiet.runtime.mayor.position);
  assert.notDeepEqual(active.runtime.residentActors[0].actor.position, quiet.runtime.residentActors[0].actor.position);
});

import assert from "node:assert/strict";
import test from "node:test";
import { TwitchFollowers } from "./twitch";
import { mapFollowNotification } from "./mapping";
import { followNotification } from "./test-fixtures";
import { NOW, sockets, settle, welcome, chatMessage } from "../chat/test-fixtures";
import { subscribeToEvent } from "../chat/subscription";
import { ChatManager } from "../chat/manager";
import { fixture } from "../auth/test-fixtures";
import { CHAT_SCOPE, SUBSCRIPTION_SCOPE, FOLLOWER_SCOPE } from "../auth/types";
import { housingNotification } from "../subscribers/test-fixtures";
import { createSession, createWorld, housesIn } from "../simulation/world";
import { processEvent } from "../simulation/engine";
import { reconcileResidents } from "../simulation/residents";
import { NextRequest } from "next/server";
import { createAuthHandlers } from "../auth/http";
import { createChatHandlers } from "../chat/http";
import { cookieNames } from "../auth/config";
import { OverlayPopulationProjector } from "../overlay/population";
import { reconcileResidentSources } from "../simulation/residents";

const code = (expected: string) => (e: unknown) => (e as { code?: string })?.code === expected;
test("community OAuth requires the same broadcaster and all grants, while subsequent chat upgrades retain follower access", async () => {
  const scopes = [CHAT_SCOPE, SUBSCRIPTION_SCOPE, FOLLOWER_SCOPE];
  for (const failure of ["none", "missing", "switched"]) {
    const f = fixture(); f.twitch.validation.scopes = failure === "missing" ? [CHAT_SCOPE, SUBSCRIPTION_SCOPE] : scopes;
    if (failure === "switched") { f.twitch.identity.twitchUserId = "999"; f.twitch.validation.userId = "999"; }
    const attempt = f.service.beginLogin(undefined, "12345", scopes), state = new URL(attempt.location).searchParams.get("state")!;
    const handlers = createAuthHandlers(() => f.service, false);
    const response = await handlers.callback(new NextRequest(`http://localhost:3000/api/auth/twitch/callback?state=${state}&code=synthetic`, { headers: { cookie: `${cookieNames(false).state}=${attempt.binding}` } }));
    assert.equal(response.headers.get("location"), failure === "none" ? "/dashboard/town?community=authorized#community" : "/account?auth=follower_scope");
  }
  const f = fixture(); f.twitch.validation.scopes = scopes; const login = await f.login(), manager = new ChatManager(f.service);
  const chat = createChatHandlers(() => f.service, () => manager, false);
  const result = await chat.authorize(new NextRequest("http://localhost:3000/api/chat/authorize", { method: "POST", headers: {
    origin: f.config.origin, cookie: `${cookieNames(false).session}=${login.id}`, "x-csrf-token": f.service.csrfToken(login.id),
  } }));
  assert.deepEqual(new URL((await result.json()).location).searchParams.get("scope")!.split(" ").sort(), [...scopes].sort());
  manager.dispose();
});
test("followers API uses broadcaster identity, paginates and returns stable identities without guessing total-only records", async () => {
  const requests: URL[] = [];
  const api = new TwitchFollowers("client", async (input, init) => {
    const url = new URL(String(input)); requests.push(url);
    assert.equal(url.origin + url.pathname, "https://api.twitch.tv/helix/channels/followers");
    assert.equal(url.searchParams.get("broadcaster_id"), "12345"); assert.equal(url.searchParams.get("first"), "100");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic");
    return Response.json({ total: 2, data: [{ user_id: requests.length === 1 ? "7" : "8", user_name: "Neighbor", followed_at: new Date(NOW).toISOString() }], pagination: requests.length === 1 ? { cursor: "next" } : {} });
  });
  const first = await api.page("synthetic", "12345"), second = await api.page("synthetic", "12345", first.cursor);
  assert.equal(requests[1].searchParams.get("after"), "next"); assert.equal(second.followers[0].twitchUserId, "8");
  for (const body of [{ total: 2, data: [], pagination: {} }, { total: 0, data: [], pagination: { cursor: "next" } }, { data: [], pagination: {} }]) {
    await assert.rejects(new TwitchFollowers("client", async () => Response.json(body)).page("synthetic", "12345"), code("invalid_response"));
  }
  assert.deepEqual((await new TwitchFollowers("client", async () => Response.json({ total: 0, data: [], pagination: {} })).page("synthetic", "12345")).followers, []);
});

test("follower retries honor rate limits, bound network failures, and do not expose upstream errors", async () => {
  const delays: number[] = []; let attempts = 0, clock = NOW;
  const wait = async (ms: number) => { delays.push(ms); clock += ms; };
  const api = new TwitchFollowers("client", async () => ++attempts === 1 ? new Response("sensitive body", { status: 429, headers: { "ratelimit-reset": String((NOW + 3000) / 1000) } })
    : Response.json({ total: 0, data: [], pagination: {} }), wait, () => clock);
  await api.page("synthetic", "12345"); assert.equal(attempts, 2); assert.deepEqual(delays, [3000]);
  attempts = 0; delays.length = 0;
  const broken = new TwitchFollowers("client", async () => { attempts++; throw new Error("sensitive URL"); }, wait, () => clock);
  await assert.rejects(broken.page("synthetic", "12345"), (e: unknown) => code("unavailable")(e) && !(e as Error).message.includes("sensitive"));
  assert.equal(attempts, 4); assert.deepEqual(delays, [1000, 2000, 4000]);
  for (const [status, category] of [[401, "invalid_token"], [403, "follower_scope"], [400, "unsupported"], [500, "unavailable"], [429, "rate_limited"]] as const) {
    await assert.rejects(new TwitchFollowers("client", async () => new Response("private", { status }), wait, () => clock).page("synthetic", "12345"), code(category));
  }
  await assert.rejects(new TwitchFollowers("client", async () => new Response(null, { status: 429, headers: { "retry-after": "120" } }), wait).page("synthetic", "12345"), code("rate_limited"));
  let calls = 0; delays.length = 0; clock = NOW;
  const exhausted = new TwitchFollowers("client", async () => { calls++; return Response.json({ total: 0, data: [], pagination: {} }, { headers: { "ratelimit-remaining": "0", "ratelimit-reset": String((NOW + 5000) / 1000) } }); }, wait, () => clock);
  await exhausted.page("synthetic", "12345"); await exhausted.page("synthetic", "12345"); assert.equal(calls, 2); assert.deepEqual(delays, [5000]);
});

test("follow v2 subscription verifies broadcaster and moderator, and rejects wrong versions/conditions", async () => {
  for (const invalid of [false, "version", "moderator"]) {
    const request: typeof fetch = async (_, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.version, "2"); assert.deepEqual(body.condition, { broadcaster_user_id: "12345", moderator_user_id: "12345" });
      if (invalid === "version") body.version = "1";
      if (invalid === "moderator") body.condition.moderator_user_id = "999";
      return Response.json({ data: [{ ...body, id: "subscription-id", status: "enabled" }] }, { status: 202 });
    };
    const promise = subscribeToEvent("channel.follow", "client", "synthetic", "12345", "socket-1", request);
    if (invalid) await assert.rejects(promise, code("unavailable")); else assert.equal(await promise, "subscription-id");
  }
  const valid = followNotification(); assert.equal(mapFollowNotification(valid, "12345", NOW)?.user.twitchUserId, "777");
  assert.equal(mapFollowNotification(valid, "999", NOW), null); assert.equal(mapFollowNotification(valid, "12345", NOW + 601000), null);
  for (const mutate of [(n: typeof valid) => { n.metadata.subscription_version = "1"; }, (n: typeof valid) => { n.payload.subscription.condition.moderator_user_id = "999"; },
    (n: typeof valid) => { n.payload.event.user_id = "forged"; }, (n: typeof valid) => { n.metadata.message_id = "bad\nID"; }]) {
    const invalid = structuredClone(valid); mutate(invalid); assert.equal(mapFollowNotification(invalid, "12345", NOW), null);
  }
});

test("all community subscriptions share the socket and migrate without losing chat or subscriber delivery", async () => {
  const f = fixture(); f.twitch.validation.scopes = [CHAT_SCOPE, SUBSCRIPTION_SCOPE, FOLLOWER_SCOPE]; const login = await f.login();
  const socket = sockets(), follows: unknown[] = [], housing: unknown[] = [], types: string[] = [];
  const manager = new ChatManager(f.service, socket.factory, () => NOW, async (_, __, ___, type) => { types.push(type!); return type === "channel.chat.message" ? "sub-1" : `sub-${type}`; },
    { enqueue: (_, __, n) => { housing.push(n); }, tick() {} }, { enqueue: (_, __, n) => { follows.push(n); }, tick() {} });
  await manager.start(login.id, "housing"); await settle(); socket.opened[0].receive(welcome()); await settle();
  await manager.start(login.id, "chat"); await settle(); socket.opened[1].receive(welcome()); await settle();
  await manager.start(login.id, "followers"); await settle();
  assert.equal(manager.followerStatus("12345").liveReady, false);
  socket.opened[2].receive(welcome()); await settle(); assert.equal(manager.followerStatus("12345").liveReady, true);
  socket.opened[2].receive(followNotification()); socket.opened[2].receive(housingNotification()); socket.opened[2].receive(chatMessage());
  assert.equal(follows.length, 1); assert.equal(housing.length, 1); assert.equal((await manager.snapshot(login.id)).receivedMessages, 1);
  const count = types.length;
  socket.opened[2].receive({ metadata: { message_type: "session_reconnect" }, payload: { session: { id: "socket-1", reconnect_url: "wss://eventsub.wss.twitch.tv/ws?session=fixture" } } });
  socket.opened[3].receive(welcome("socket-2", null)); await settle();
  const follow = followNotification(); follow.payload.subscription.transport.session_id = "socket-2"; socket.opened[3].receive(follow);
  assert.equal(follows.length, 2); assert.equal(types.length, count);
  await manager.stop(login.id, "followers"); await settle(); socket.opened[4].receive(welcome()); await settle();
  assert.equal(manager.followerStatus("12345").liveReady, false); assert.equal(manager.housingStatus("12345").liveReady, true); assert.equal((await manager.snapshot(login.id)).subscriptionReady, true);
  manager.dispose();
});

test("historical members settle quietly; only genuinely new live followers arrive, without houses", () => {
  const world = createWorld({ id: "historical", seed: 42, name: "Test", mayorName: "Mochi", streamerTwitchUserId: "12345" }), user = { twitchUserId: "777", displayName: "Member" };
  const imported = processEvent(createSession(world, NOW), { type: "NEW_SUBSCRIBER", id: "import", townId: world.id, occurredAt: NOW, user }, NOW, { allowExpansion: true, historical: true }).state;
  assert.equal(imported.world.residents[0].established, true); assert.equal(imported.runtime.effects.length, 0); assert.equal(imported.runtime.mayor.tasks.length, 0);
  assert.notEqual(reconcileResidents(imported.world, NOW, [], world)[0].actor.nodeId, "hall");
  const projector = new OverlayPopulationProjector();
  const projected = projector.project(imported.world);
  assert.equal(projected.actors[0].established, true);
  assert.notEqual(reconcileResidentSources(imported.world, NOW, projected.actors, [], new Set())[0].actor.nodeId, "hall");
  const followed = processEvent(imported, { type: "NEW_FOLLOWER", id: "follow-existing", townId: world.id, occurredAt: NOW, user }).state;
  assert.equal(followed.runtime.effects.length, 0); assert.deepEqual(followed.world.buildings, imported.world.buildings);
  const newcomer = processEvent(followed, { type: "NEW_FOLLOWER", id: "follow-new", townId: world.id, occurredAt: NOW, user: { ...user, twitchUserId: "888" } }).state;
  assert.ok(newcomer.runtime.effects.length); assert.equal(newcomer.world.residents[1].houseId, null);
  assert.equal(housesIn(newcomer.world).length, housesIn(imported.world).length);
  assert.equal(reconcileResidents(newcomer.world, NOW, [], followed.world).find((a) => a.residentId === newcomer.world.residents[1].id)?.actor.nodeId, "hall");
});

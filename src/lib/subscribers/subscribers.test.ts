import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../auth/test-fixtures";
import { AuthError, CHAT_SCOPE, SUBSCRIPTION_SCOPE } from "../auth/types";
import { NOW, settle, sockets, welcome, chatMessage } from "../chat/test-fixtures";
import { ChatManager } from "../chat/manager";
import { subscribeToEvent } from "../chat/subscription";
import { SUBSCRIPTION_EVENTS, HousingError } from "./types";
import { TwitchSubscriptions } from "./twitch";
import { mapHousingNotification } from "./mapping";
import { housingNotification } from "./test-fixtures";

test("subscription upgrade preserves chat, requires every granted scope and the same Twitch account", async () => {
  for (const outcome of ["granted", "missing-subscriptions", "missing-chat", "switched"]) {
    const f = fixture(); f.twitch.validation.scopes = [CHAT_SCOPE]; const first = await f.login();
    const attempt = f.service.beginLogin(undefined, "12345", [SUBSCRIPTION_SCOPE, CHAT_SCOPE]);
    const url = new URL(attempt.location);
    assert.deepEqual(new Set(url.searchParams.get("scope")!.split(" ")), new Set([CHAT_SCOPE, SUBSCRIPTION_SCOPE]));
    f.twitch.validation.scopes = outcome === "missing-subscriptions" ? [CHAT_SCOPE] : outcome === "missing-chat" ? [SUBSCRIPTION_SCOPE] : [CHAT_SCOPE, SUBSCRIPTION_SCOPE];
    if (outcome === "switched") { f.twitch.validation.userId = "999"; f.twitch.identity.twitchUserId = "999"; }
    const login = f.service.finishLogin({ state: url.searchParams.get("state")!, code: "synthetic-code" }, attempt.binding, first.id);
    if (outcome === "granted") {
      const next = await login, grant = await f.service.scopedSession(next.id);
      assert.ok(grant.scopes.includes(SUBSCRIPTION_SCOPE)); assert.ok(grant.scopes.includes(CHAT_SCOPE));
      assert.equal(await f.service.getProfile(first.id), null);
    } else await assert.rejects(login, (e: unknown) => e instanceof AuthError && e.code === "subscription_scope");
  }
  const f = fixture();
  assert.throws(() => f.service.beginLogin(undefined, undefined, [SUBSCRIPTION_SCOPE]));
  assert.throws(() => f.service.beginLogin(undefined, "12345", ["moderator:manage:banned_users"]));
});

test("Helix pagination uses server-owned broadcaster ID, bounded pages and user tokens", async () => {
  const seen: URL[] = [];
  const api = new TwitchSubscriptions("synthetic-client", async (input, init) => {
    const url = new URL(String(input)); seen.push(url);
    assert.equal(url.origin + url.pathname, "https://api.twitch.tv/helix/subscriptions");
    assert.equal(url.searchParams.get("broadcaster_id"), "12345"); assert.equal(url.searchParams.get("first"), "100");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-token"); assert.equal(init?.redirect, "error");
    return Response.json({ data: [{ broadcaster_id: "12345", user_id: "777", user_name: "Neighbor", tier: "2000", is_gift: true, gifter_id: "999" }], pagination: seen.length === 1 ? { cursor: "opaque+/==" } : {} });
  });
  const first = await api.page("synthetic-token", "12345");
  await api.page("synthetic-token", "12345", first.cursor);
  await api.page("synthetic-token", "12345", undefined, "777");
  assert.equal(seen[1].searchParams.get("after"), "opaque+/=="); assert.equal(seen[2].searchParams.get("user_id"), "777");
  assert.deepEqual(first.subscribers, [{ twitchUserId: "777", displayName: "Neighbor", tier: "2000", isGift: true }]);
});

test("Helix errors, foreign-channel records and invalid pagination fail without exposing response bodies", async () => {
  for (const [status, code] of [[401,"invalid_token"],[403,"unsupported"],[422,"unsupported"],[429,"rate_limited"],[500,"unavailable"]] as const) {
    const api = new TwitchSubscriptions("client", async () => new Response("private upstream body", { status }));
    await assert.rejects(api.page("synthetic", "12345"), (e: unknown) => (e instanceof HousingError || e instanceof AuthError) && e.code === code && !e.message.includes("private"));
  }
  const bad = [null, { data: [], pagination: { cursor: "" } }, { data: [{ broadcaster_id: "999", user_id: "777", user_name: "N", tier: "1000", is_gift: false }], pagination: {} }];
  for (const value of bad) await assert.rejects(new TwitchSubscriptions("client", async () => Response.json(value)).page("synthetic", "12345"), (e: unknown) => e instanceof HousingError && e.code === "invalid_response");
  await assert.rejects(new TwitchSubscriptions("client", async () => { throw new Error("private network detail"); }).page("synthetic", "12345"), (e: unknown) => e instanceof HousingError && e.code === "unavailable");
});

test("all four housing events map only verified channel envelopes; anonymous gifts carry no invented identity or chat text", () => {
  for (const type of SUBSCRIPTION_EVENTS) {
    const input = housingNotification(type), mapped = mapHousingNotification(input, "12345", NOW)!;
    assert.equal(mapped.type, type); assert.equal(mapped.id, "eventsub:delivery:fixture/+==");
    assert.ok(!JSON.stringify(mapped).includes("private resub"));
    assert.equal(mapHousingNotification(input, "999", NOW), null);
    assert.equal(mapHousingNotification(input, "12345", NOW + 601000), null);
    input.payload.subscription.status = "authorization_revoked";
    assert.equal(mapHousingNotification(input, "12345", NOW), null);
  }
  const anonymous = housingNotification("channel.subscription.gift"); anonymous.payload.event.is_anonymous = true;
  // Twitch may omit anonymous identity fields. No fabricated user enters the domain.
  Object.assign(anonymous.payload.event, { user_id: null, user_name: null });
  assert.equal(mapHousingNotification(anonymous, "12345", NOW)?.user, null);
  const wrong = housingNotification(); wrong.metadata.message_id = "bad\nID";
  assert.equal(mapHousingNotification(wrong, "12345", NOW), null);
});

test("subscription API requests all documented version-1 broadcaster-only conditions", async () => {
  for (const type of SUBSCRIPTION_EVENTS) {
    const id = await subscribeToEvent(type, "client", "synthetic", "12345", "socket-1", async (_, init) => {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body, { type, version: "1", condition: { broadcaster_user_id: "12345" }, transport: { method: "websocket", session_id: "socket-1" } });
      return Response.json({ data: [{ ...body, id: "36d810a6-08f7-4dc5-bcf0-e9af41bba742", status: "enabled" }] }, { status: 202 });
    });
    assert.equal(id, "36d810a6-08f7-4dc5-bcf0-e9af41bba742");
  }
});

test("chat and housing share one socket, await all subscriptions, route by type and transfer all on reconnect", async () => {
  const f = fixture(); f.twitch.validation.scopes = [CHAT_SCOPE, SUBSCRIPTION_SCOPE]; const login = await f.login();
  const socket = sockets(), registrations: string[] = [], notifications: unknown[] = [];
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const manager = new ChatManager(f.service, socket.factory, () => NOW, async (_, broadcaster, __, type) => {
    assert.equal(broadcaster, "12345"); registrations.push(type!);
    if (type === "channel.subscription.message") await delayed;
    return type === "channel.chat.message" ? "sub-1" : `sub-${type}`;
  }, { enqueue: (_, __, input) => { notifications.push(input); }, tick() {} });
  await manager.start(login.id); await settle(); socket.opened[0].receive(welcome()); await settle();
  await manager.start(login.id, "housing"); await settle(); assert.equal(socket.opened[0].closed, true);
  socket.opened[1].receive(welcome()); await settle();
  assert.equal(manager.housingStatus("12345").liveReady, false);
  socket.opened[1].receive(housingNotification()); assert.equal(notifications.length, 0);
  release(); await settle(); assert.equal(manager.housingStatus("12345").liveReady, true);
  assert.equal(notifications.length, 1); assert.equal(registrations.length, 6);
  socket.opened[1].receive(chatMessage()); assert.equal((await manager.snapshot(login.id)).receivedMessages, 1);
  const foreign = housingNotification(); foreign.payload.subscription.id = "foreign";
  socket.opened[1].receive(foreign); assert.equal(notifications.length, 1);
  socket.opened[1].receive({ metadata: { message_type: "session_reconnect" }, payload: { session: { id: "socket-1", reconnect_url: "wss://eventsub.wss.twitch.tv/ws?session=fixture" } } });
  socket.opened[2].receive(welcome("socket-2", null)); await settle();
  assert.equal(registrations.length, 6); assert.equal(socket.opened[1].closed, true);
  for (const type of SUBSCRIPTION_EVENTS) {
    const input = housingNotification(type); input.payload.subscription.transport.session_id = "socket-2";
    socket.opened[2].receive(input);
  }
  assert.equal(notifications.length, 5);
  await manager.stop(login.id, "housing"); await settle();
  socket.opened[3].receive(welcome("socket-3")); await settle();
  assert.equal(manager.housingStatus("12345").liveReady, false); assert.equal((await manager.snapshot(login.id)).subscriptionReady, true);
  manager.dispose();
});

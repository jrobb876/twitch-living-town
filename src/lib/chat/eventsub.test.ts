import assert from "node:assert/strict";
import test from "node:test";
import { AuthError } from "../auth/types";
import { EVENTSUB_URL, EventSubConnection } from "./eventsub";
import { chatMessage, NOW, settle, sockets, welcome } from "./test-fixtures";
import { subscribeToChat } from "./subscription";
import { LiveChatFeed } from "./feed";

function setup() {
  const socket = sockets(), subscriptions: string[][] = [], received: unknown[] = [];
  let clock = NOW, authorized = true, revocations = 0;
  const connection = new EventSubConnection({ socket: socket.factory, now: () => clock, random: () => 0,
    authorized: () => authorized, credentials: async () => ({ accessToken: "synthetic-access" }),
    subscribe: async (token, id) => { subscriptions.push([token, id]); return "sub-1"; },
    notification: (value) => { received.push(value); }, revoked: () => { revocations++; },
  });
  const start = async () => { connection.start(); await settle(); };
  const connect = async () => { await start(); socket.opened[0].receive(welcome()); await settle(); };
  return { ...socket, connection, subscriptions, received, start, connect, advance: (ms: number) => { clock += ms; },
    unauthorized: () => { authorized = false; }, revocations: () => revocations };
}

test("EventSub waits for welcome, subscribes once and accepts only its subscription/session", async () => {
  const f = setup(); await f.start();
  assert.equal(f.opened[0].url, EVENTSUB_URL); assert.equal(f.subscriptions.length, 0);
  f.connection.start(); assert.equal(f.opened.length, 1);
  f.opened[0].receive(welcome()); f.opened[0].receive(welcome()); await settle();
  assert.deepEqual(f.subscriptions, [["synthetic-access", "socket-1"]]);
  assert.equal(f.connection.status, "connected");
  f.opened[0].receive(chatMessage()); assert.equal(f.received.length, 1);
  const foreign = chatMessage("other"); foreign.payload.subscription.id = "another-subscription";
  f.opened[0].receive(foreign);
  f.opened[0].receive(chatMessage("other", "111", "Hi", "12345", NOW, "wrong-socket"));
  f.opened[0].receive("not-json"); assert.equal(f.received.length, 1);
});

test("keepalive extends liveness; timeout reconnects with backoff and recreates subscription", async () => {
  const f = setup(); await f.connect();
  f.advance(29_000); f.opened[0].receive({ metadata: { message_type: "session_keepalive" }, payload: {} });
  f.advance(2000); f.connection.tick(); assert.equal(f.connection.status, "connected");
  f.advance(28_000); f.connection.tick(); assert.equal(f.connection.status, "reconnecting"); assert.equal(f.opened[0].closed, true);
  f.advance(999); f.connection.tick(); await settle(); assert.equal(f.opened.length, 1);
  f.advance(1); f.connection.tick(); await settle(); assert.equal(f.opened.length, 2);
  f.opened[1].receive(welcome("socket-2")); await settle();
  assert.equal(f.subscriptions.length, 2); assert.equal(f.subscriptions[1][1], "socket-2");
});

test("Twitch reconnect URL is followed exactly and transfers subscriptions before closing old socket", async () => {
  const f = setup(); await f.connect();
  const url = "wss://eventsub.wss.twitch.tv/ws?session=synthetic%2Bvalue&keepalive_timeout_seconds=30";
  f.opened[0].receive({ metadata: { message_type: "session_reconnect" }, payload: { session: { id: "socket-1", reconnect_url: url } } });
  assert.equal(f.opened.length, 2); assert.equal(f.opened[1].url, url); assert.equal(f.opened[0].closed, false);
  f.opened[0].receive(chatMessage()); assert.equal(f.received.length, 1);
  f.opened[1].receive(welcome("socket-2", null)); await settle();
  assert.equal(f.opened[0].closed, true); assert.equal(f.subscriptions.length, 1); assert.equal(f.connection.status, "connected");
  f.opened[0].disconnect(); assert.equal(f.connection.status, "connected");
  f.opened[1].receive(chatMessage("new-message", "111", "Hi", "12345", NOW, "socket-2")); assert.equal(f.received.length, 2);
});

test("handoff can finish after old edge closes; failed handoffs fall back to a fresh subscription", async () => {
  for (const fail of [false, true]) {
    const f = setup(); await f.connect();
    f.opened[0].receive({ metadata: { message_type: "session_reconnect" }, payload: { session: { id: "socket-1", reconnect_url: "wss://eventsub.wss.twitch.tv/ws?session=test" } } });
    f.opened[0].disconnect();
    if (fail) {
      f.opened[1].error(); f.advance(1000); f.connection.tick(); await settle();
      assert.equal(f.opened[2].url, EVENTSUB_URL);
      f.opened[2].receive(welcome("fresh")); await settle(); assert.equal(f.subscriptions.length, 2);
    } else {
      f.opened[1].receive(welcome("migrated")); await settle(); assert.equal(f.subscriptions.length, 1);
    }
    assert.equal(f.connection.status, "connected");
  }
});

test("untrusted reconnect endpoints are rejected without opening a socket", async () => {
  for (const url of ["wss://evil.example/ws", "https://eventsub.wss.twitch.tv/ws", "wss://user:pass@eventsub.wss.twitch.tv/ws"]) {
    const f = setup(); await f.connect();
    f.opened[0].receive({ metadata: { message_type: "session_reconnect" }, payload: { session: { id: "socket-1", reconnect_url: url } } });
    assert.equal(f.opened.length, 1); assert.equal(f.connection.status, "reconnecting");
  }
});

test("revocation and lost session authorization close sockets and never automatically reconnect", async () => {
  for (const revoked of [true, false]) {
    const f = setup(); await f.connect();
    if (revoked) {
      const event = chatMessage(); event.metadata.message_type = "revocation"; event.payload.subscription.status = "authorization_revoked";
      f.opened[0].receive(event);
    } else { f.unauthorized(); f.connection.tick(); }
    assert.equal(f.connection.status, "revoked"); assert.equal(f.opened[0].closed, true);
    f.advance(120_000); f.connection.tick(); await settle(); assert.equal(f.opened.length, 1);
    assert.equal(f.revocations(), revoked ? 1 : 0);
  }
});

test("welcome timeout and socket errors recover, while stopped async subscription cannot resurrect", async () => {
  const f = setup(); await f.start(); f.advance(10_000); f.connection.tick();
  assert.equal(f.connection.status, "reconnecting");
  f.advance(1000); f.connection.tick(); await settle(); f.opened[1].error();
  assert.equal(f.connection.status, "reconnecting");
  f.connection.stop(); f.advance(120_000); f.connection.tick(); await settle(); assert.equal(f.opened.length, 2);
  const socket = sockets(); let release!: (id: string) => void;
  const connection = new EventSubConnection({ socket: socket.factory, now: () => NOW, random: () => 0, authorized: () => true,
    credentials: async () => ({ accessToken: "fake" }), subscribe: () => new Promise((resolve) => { release = resolve; }), notification() {}, revoked() {} });
  connection.start(); await settle(); socket.opened[0].receive(welcome()); connection.stop(); release("sub-1"); await settle();
  assert.equal(connection.status, "disconnected");
});

test("subscription API uses a user token, own broadcaster/user condition and welcome session ID", async () => {
  const requests: RequestInit[] = [];
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, "https://api.twitch.tv/helix/eventsub/subscriptions"); requests.push(options!);
    return Response.json({ data: [{ id: "sub-1", status: "enabled", ...JSON.parse(String(options!.body)) }] }, { status: 202 });
  };
  assert.equal(await subscribeToChat("client", "synthetic-user-token", "12345", "socket-1", request), "sub-1");
  const options = requests[0];
  assert.equal(new Headers(options.headers).get("authorization"), "Bearer synthetic-user-token");
  assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
  assert.deepEqual(JSON.parse(String(options.body)), { type: "channel.chat.message", version: "1", condition: { broadcaster_user_id: "12345", user_id: "12345" }, transport: { method: "websocket", session_id: "socket-1" } });
  for (const [status, code] of [[401, "invalid_token"], [403, "chat_scope"], [429, "unavailable"], [409, "unavailable"]] as const) {
    await assert.rejects(subscribeToChat("client", "token", "12345", "socket", async () => new Response("private body", { status })),
      (error: unknown) => error instanceof AuthError && error.code === code);
  }
});

test("a broadcaster notification arriving before the subscription HTTP response is processed after confirmation", async () => {
  const socket = sockets(), feed = new LiveChatFeed("12345", NOW);
  let release!: (id: string) => void;
  const connection = new EventSubConnection({ socket: socket.factory, now: () => NOW, random: () => 0, authorized: () => true,
    credentials: async () => ({ accessToken: "synthetic" }), subscribe: () => new Promise((resolve) => { release = resolve; }),
    notification: (value) => { feed.receive(value, NOW); }, revoked() {} });
  connection.start(); await settle(); socket.opened[0].receive(welcome());
  assert.equal(connection.socketConnected, true); assert.equal(connection.subscriptionReady, false);
  assert.equal(connection.status, "connecting");
  const message = chatMessage("6bd87cb3-5d96-4ae4-a437-6a875d7da215", "12345");
  message.metadata.message_timestamp = "2026-10-27T12:00:00.000000000Z";
  socket.opened[0].receive(message);
  const foreign = chatMessage("foreign", "12345"); foreign.payload.subscription.id = "foreign-sub";
  socket.opened[0].receive(foreign);
  assert.equal(feed.receivedMessages, 0);
  release("sub-1"); await settle();
  assert.equal(connection.subscriptionReady, true);
  assert.equal(feed.receivedMessages, 1);
  socket.opened[0].receive(message); // Same Twitch message must not count twice.
  assert.equal(feed.receivedMessages, 1);
  assert.equal(feed.snapshot(NOW).sampleAgesMs.length, 1);
  connection.stop(); assert.equal(connection.socketConnected, false); assert.equal(connection.subscriptionReady, false);
});

test("early notifications stay bounded and are discarded when subscription creation fails or stops", async () => {
  for (const outcome of ["success", "failure", "stop"]) {
    const socket = sockets(); let accepted = 0;
    let release!: (id: string) => void, reject!: (error: Error) => void;
    const connection = new EventSubConnection({ socket: socket.factory, now: () => NOW, random: () => 0, authorized: () => true,
      credentials: async () => ({ accessToken: "synthetic" }), subscribe: () => new Promise((resolve, fail) => { release = resolve; reject = fail; }),
      notification: () => { accepted++; }, revoked() {} });
    connection.start(); await settle(); socket.opened[0].receive(welcome());
    for (let index = 0; index < 101; index++) socket.opened[0].receive(chatMessage(`early-${index}`));
    if (outcome === "stop") connection.stop();
    if (outcome === "failure") reject(new AuthError("unavailable")); else release("sub-1");
    await settle();
    assert.equal(accepted, outcome === "success" ? 100 : 0);
    assert.equal(connection.subscriptionReady, outcome === "success");
    connection.stop();
  }
});

test("HTTP 202 alone is insufficient: subscription identity, status, transport and conditions must match", async () => {
  const valid = { id: "sub-1", status: "enabled", type: "channel.chat.message", version: "1",
    condition: { broadcaster_user_id: "12345", user_id: "12345" }, transport: { method: "websocket", session_id: "socket-1" } };
  for (const mutate of [
    (data: typeof valid) => { data.id = ""; },
    (data: typeof valid) => { data.status = "webhook_callback_verification_pending"; },
    (data: typeof valid) => { data.type = "channel.follow"; },
    (data: typeof valid) => { data.condition.broadcaster_user_id = "999"; },
    (data: typeof valid) => { data.condition.user_id = "999"; },
    (data: typeof valid) => { data.transport.method = "webhook"; },
    (data: typeof valid) => { data.transport.session_id = "another-socket"; },
  ]) {
    const data = structuredClone(valid); mutate(data);
    await assert.rejects(subscribeToChat("client", "synthetic", "12345", "socket-1", async () => Response.json({ data: [data] }, { status: 202 })),
      (error: unknown) => error instanceof AuthError && error.code === "unavailable");
  }
});

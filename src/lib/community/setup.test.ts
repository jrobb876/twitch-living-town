import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixture } from "../auth/test-fixtures";
import { cookieNames } from "../auth/config";
import { createAuthHandlers } from "../auth/http";
import { AuthError, COMMUNITY_SCOPES, CHAT_SCOPE } from "../auth/types";
import { createWorld } from "../simulation/world";
import type { SubscriberSync } from "../simulation/types";
import { ChatManager } from "../chat/manager";
import { sockets, welcome, settle } from "../chat/test-fixtures";
import type { CommunityImport } from "./types";
import { CommunitySetup } from "./setup";
import { createSetupHandlers } from "./setup-http";
import { connectionLabel, continuation, defaultSelection, type Selection } from "./setup-model";
import TownExperience from "../../components/town-experience";
import StreamerWorkspace from "../../components/streamer-workspace";

async function setup(scopes = COMMUNITY_SCOPES) {
  const f = fixture(); f.twitch.validation.scopes = [...scopes]; const login = await f.login();
  const town = { world: createWorld({ id: "owned-town", streamerTwitchUserId: f.twitch.identity.twitchUserId, seed: 42, name: "Existing town", mayorName: "Mochi" }), revision: 1, updatedAt: "2026-10-31" };
  const imports = { followers: 0, subscribers: 0 };
  const state = { summary: null as CommunityImport | null, lastSync: null as SubscriberSync | null, failFollowers: false, block: null as Promise<void> | null };
  const community = {
    status: async () => ({ hasTown: true, summary: state.summary, retryAt: 0, persistenceError: false, revision: 1, pendingEvents: 0, deliveryError: null }),
    start: async (_grant: unknown, options?: { includeSubscribers?: boolean }) => {
      assert.equal(options?.includeSubscribers, false); imports.followers++;
      if (state.block) await state.block;
      if (state.failFollowers) throw new AuthError("unavailable");
      return state.summary = { id: "synthetic", status: "complete", phase: "finished", startedAt: 0, finishedAt: 1, updatedAt: 1, leaseUntil: 1,
        followersDiscovered: 12, subscribersDiscovered: 0, uniqueResidentsImported: 12, subscriberHousesAssigned: 0, pages: 1, error: null };
    },
  };
  const housing = {
    status: async () => ({ hasTown: true, lastSync: state.lastSync, revision: 1, active: 0, legacy: 0, verifiedHouses: 0, availablePlots: 12,
      waitlisted: 0, deliveryError: null, pendingEvents: 0, presentations: [] }),
    startSync: async (_grant: unknown, options?: { historical?: boolean }) => {
      assert.equal(options?.historical, true); imports.subscribers++;
      return state.lastSync = { id: "synthetic", status: "complete", startedAt: 0, finishedAt: 1, imported: 2, updated: 0, unchanged: 0, waitlisted: 0, failed: 0, pages: 1, error: null };
    },
  };
  const wire = sockets(); let failSubscription = false;
  const chat = new ChatManager(f.service, wire.factory, Date.now, async (_token, _user, _session, type) => {
    if (failSubscription && type === "channel.subscribe") throw new Error("synthetic failure");
    return `subscription-${type}`;
  });
  const persistence = { mine: async () => town };
  const coordinator = new CommunitySetup(f.service, () => persistence, community, housing, chat);
  const handlers = createSetupHandlers(() => f.service, () => coordinator, false);
  const request = (body?: unknown, headers: Record<string, string> = {}) => new NextRequest("http://localhost:3000/api/community/setup", {
    method: body ? "POST" : "GET", headers: { cookie: `${cookieNames(false).session}=${login.id}`, origin: f.config.origin,
      "content-type": "application/json", "x-csrf-token": f.service.csrfToken(login.id), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ...f, login, town, imports, state, community, housing, chat, wire, persistence, coordinator, handlers, request,
    failSubscription: () => { failSubscription = true; } };
}
const input = (action = "connect", selected: Selection = defaultSelection) => ({ action, townId: "owned-town", selected });

test("guided authorization requests only chosen existing scopes and retains already granted access", async () => {
  const s = await setup([CHAT_SCOPE]);
  const response = await s.handlers.control(s.request(input("authorize", { followers: true, subscribers: false, chat: false })));
  assert.equal(response.status, 200);
  const location = new URL((await response.json()).location);
  assert.deepEqual(location.searchParams.get("scope")!.split(" ").sort(), ["moderator:read:followers", CHAT_SCOPE].sort());
  assert.equal(response.cookies.get(cookieNames(false).state)?.httpOnly, true);
  assert.deepEqual(s.imports, { followers: 0, subscribers: 0 }); assert.equal(s.wire.opened.length, 0);
  s.chat.dispose();
});

test("already authorized setup imports selected histories once, preserves the town and awaits actual EventSub readiness", async () => {
  const s = await setup(), before = structuredClone(s.town);
  assert.equal((await s.handlers.control(s.request(input()))).status, 200);
  await settle();
  assert.deepEqual(s.imports, { followers: 1, subscribers: 1 });
  assert.equal(s.wire.opened.length, 1, "One guided action creates one shared socket");
  assert.equal(connectionLabel(await s.coordinator.status(s.login.id), defaultSelection), "Reconnecting");
  s.wire.opened.at(-1)!.receive(welcome()); await settle();
  assert.equal(connectionLabel(await s.coordinator.status(s.login.id), defaultSelection), "Connected");
  const socketsBefore = s.wire.opened.length;
  await s.handlers.control(s.request(input()));
  assert.deepEqual(s.imports, { followers: 1, subscribers: 1 }); assert.equal(s.wire.opened.length, socketsBefore);
  assert.deepEqual(s.town, before); s.chat.dispose();
});

test("partial grants keep eligible chat usable without importing unauthorized features or redirecting", async () => {
  const s = await setup([CHAT_SCOPE]);
  const response = await s.handlers.control(s.request(input()));
  assert.equal(response.status, 200); assert.equal(response.headers.get("location"), null);
  assert.deepEqual((await response.json()).errors, { followers: "permission_required", subscribers: "permission_required" });
  assert.deepEqual(s.imports, { followers: 0, subscribers: 0 });
  s.wire.opened.at(-1)!.receive(welcome()); await settle();
  assert.equal(connectionLabel(await s.coordinator.status(s.login.id), defaultSelection), "Partially connected");
  s.chat.dispose();
});

test("OAuth setup return is fixed, state-bound, single-use and reports denial or partial grant without creating a session", async () => {
  for (const outcome of ["success", "denied", "partial", "wrong-account"]) {
    const s = await setup([]), result = await s.handlers.control(s.request(input("authorize")));
    const location = new URL((await result.json()).location), binding = result.cookies.get(cookieNames(false).state)!.value;
    s.twitch.validation.scopes = outcome === "partial" ? [CHAT_SCOPE] : COMMUNITY_SCOPES;
    if (outcome === "wrong-account") { s.twitch.identity.twitchUserId = "999"; s.twitch.validation.userId = "999"; }
    const handlers = createAuthHandlers(() => s.service, false);
    const callback = () => new NextRequest(`http://localhost:3000/api/auth/twitch/callback?state=${location.searchParams.get("state")}&${outcome === "denied" ? "error=access_denied" : "code=synthetic"}`, {
      headers: { cookie: `${cookieNames(false).state}=${binding}; ${cookieNames(false).session}=${s.login.id}` },
    });
    const response = await handlers.callback(callback());
    assert.equal(response.headers.get("location"), `/dashboard/town?setup=${outcome === "success" ? "authorized" : outcome === "denied" ? "denied" : "follower_scope"}#community`);
    assert.equal(!!response.cookies.get(cookieNames(false).session), outcome === "success");
    assert.deepEqual(s.imports, { followers: 0, subscribers: 0 });
    assert.equal((await handlers.callback(callback())).headers.get("location"), "/account?auth=state");
    if (outcome === "success") {
      const id = response.cookies.get(cookieNames(false).session)!.value;
      assert.equal((await s.handlers.control(s.request(input(), { cookie: `${cookieNames(false).session}=${id}`, "x-csrf-token": s.service.csrfToken(id) }))).status, 200);
      assert.deepEqual(s.imports, { followers: 1, subscribers: 1 });
    }
    s.chat.dispose();
  }
});

test("continuation requires recent matching tab intent and never resumes denied, expired or foreign-town setup", () => {
  const now = Date.now(), intent = { townId: "owned-town", selected: defaultSelection, expiresAt: now + 60000, phase: "authorizing" };
  assert.deepEqual(continuation(JSON.stringify(intent), intent.townId, "authorized", now), defaultSelection);
  for (const [raw, town, result] of [[null, intent.townId, "authorized"], [JSON.stringify(intent), "other-town", "authorized"],
    [JSON.stringify(intent), intent.townId, "denied"], ["broken", intent.townId, "authorized"],
    [JSON.stringify({ ...intent, expiresAt: now - 1 }), intent.townId, "authorized"]]) assert.equal(continuation(raw, town!, result, now), null);
});

test("concurrent setup requests do not duplicate work; partial import failure preserves other successful steps", async () => {
  const s = await setup(); let release!: () => void;
  s.state.block = new Promise<void>((resolve) => { release = resolve; });
  const first = s.coordinator.connect(s.login.id, s.town.world.id, defaultSelection);
  while (!s.imports.followers) await settle();
  assert.equal((await s.coordinator.connect(s.login.id, s.town.world.id, defaultSelection)).busy, true);
  s.state.failFollowers = true; release();
  assert.equal((await first).errors.followers, "unavailable");
  assert.deepEqual(s.imports, { followers: 1, subscribers: 1 });
  s.state.failFollowers = false; s.state.block = null;
  await s.coordinator.connect(s.login.id, s.town.world.id, defaultSelection);
  assert.deepEqual(s.imports, { followers: 2, subscribers: 1 }); s.chat.dispose();
});

test("a failed EventSub subscription never reports fully connected; restart reconnects without reimporting", async () => {
  const s = await setup(); s.failSubscription(); await s.coordinator.connect(s.login.id, s.town.world.id, defaultSelection);
  await settle();
  s.wire.opened.at(-1)!.receive(welcome()); await settle();
  const failed = await s.coordinator.status(s.login.id);
  assert.notEqual(connectionLabel(failed, defaultSelection), "Connected"); assert.equal(failed.live.subscribers.ready, false);
  s.chat.dispose();
  const wire = sockets(), fresh = new ChatManager(s.service, wire.factory, Date.now, async (_token, _user, _session, type) => `synthetic-${type}`);
  const resumed = new CommunitySetup(s.service, () => s.persistence, s.community, s.housing, fresh);
  assert.equal(connectionLabel(await resumed.status(s.login.id), defaultSelection), "Connection lost");
  await resumed.connect(s.login.id, s.town.world.id, defaultSelection); await settle(); wire.opened.at(-1)!.receive(welcome()); await settle();
  assert.equal(connectionLabel(await resumed.status(s.login.id), defaultSelection), "Connected");
  assert.deepEqual(s.imports, { followers: 1, subscribers: 1 }); fresh.dispose();
});

test("setup rejects cross-town, cross-origin, forged CSRF, anonymous and arbitrary world-update requests", async () => {
  const s = await setup();
  for (const [body, headers, expected] of [
    [{ ...input(), townId: "another-town" }, {}, 403], [input(), { origin: "https://foreign.example" }, 403],
    [input(), { "x-csrf-token": "forged" }, 403], [input(), { cookie: "" }, 403],
    [{ ...input(), world: s.town.world }, {}, 400],
  ] as const) assert.equal((await s.handlers.control(s.request(body, headers))).status, expected);
  assert.equal((await s.handlers.status(s.request(undefined, { cookie: "" }))).status, 401);
  s.town.world.streamerTwitchUserId = "another-owner";
  assert.equal((await s.handlers.control(s.request(input()))).status, 403);
  assert.deepEqual(s.imports, { followers: 0, subscribers: 0 }); assert.equal(s.wire.opened.length, 0); s.chat.dispose();
});

test("Overview offers compact management link and source controls; management retains collapsed troubleshooting", async () => {
  const s = await setup();
  const overview = renderToStaticMarkup(createElement(TownExperience, { initialTown: s.town, enableSimulator: true }));
  assert.match(overview, /href="\/dashboard\/town#community"/);
  assert.match(overview, /View simulated town/); assert.match(overview, /MEET YOUR MAYOR/);
  for (const control of ["Authorize Twitch Chat", "Sync Subscribers", "Authorize Community Import", "Connect subscription events"]) assert.ok(!overview.includes(control));
  const management = renderToStaticMarkup(createElement(StreamerWorkspace, { initialTown: s.town, csrfToken: "synthetic" }));
  assert.match(management, /Connect My Twitch Community/); assert.match(management, /<details><summary>Advanced Settings &amp; Troubleshooting/);
  assert.match(management, /Community Import/); assert.match(management, /Subscriber Housing/); assert.match(management, /Twitch chat/);
  s.chat.dispose();
});

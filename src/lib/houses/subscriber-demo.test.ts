import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixture } from "../auth/test-fixtures";
import { cookieNames } from "../auth/config";
import { maplebrook, MAPLEBROOK_ID, SubscriberDemoStore, subscriberDemoEnabled } from "./subscriber-demo";
import { subscriberDemoHandlers } from "./subscriber-demo-http";
import { exteriorOf } from "./customization";
import { housesIn, createWorld } from "../simulation/world";
import { neighborhoodCount } from "../simulation/population";
import { dashboardAccess } from "../persistence/dashboard";
import type { TownPersistenceService } from "../persistence/service";
import PropertyCards from "../../components/property-cards";
import AccountDashboard from "../../components/account-dashboard";
import HouseEditor from "../../components/house-editor";
import { houseFocusCamera } from "../rendering/house-focus";
import { createHouseHandlers } from "./http";

test("Maplebrook allocates fifteen unique homes and two real neighborhoods deterministically for any viewer", () => {
  const f = fixture(), profile = f.twitch.identity;
  const world = maplebrook(profile), again = maplebrook(profile);
  assert.deepEqual(world, again);
  assert.equal(world.residents.length, 15); assert.equal(new Set(world.residents.map((r) => r.twitchUserId)).size, 15);
  assert.equal(housesIn(world).length, 15); assert.equal(housesIn(world).filter((h) => h.ownerTwitchUserId).length, 15);
  assert.equal(new Set(world.residents.map((r) => r.houseId)).size, 15);
  assert.equal(neighborhoodCount(world), 2); assert.equal(world.districts.filter((d) => d.generation).length, 1);
  assert.equal(world.residents.filter((r) => r.twitchUserId === profile.twitchUserId).length, 1);
  const starter = createWorld({ id: MAPLEBROOK_ID, streamerTwitchUserId: world.streamerTwitchUserId, seed: world.seed, name: world.name, mayorName: world.mayor.name });
  assert.equal(housesIn(starter).length, 12);
  assert.deepEqual(world.processedEvents.slice(0, 12).flatMap((e) => e.houseIds).sort(), housesIn(starter).map((h) => h.id).sort());
  const other = maplebrook({ ...profile, twitchUserId: "new-judge", displayName: "Fresh Judge" });
  assert.deepEqual(other.layout, world.layout); assert.deepEqual(other.plots, world.plots);
  const home = housesIn(world).find((h) => h.ownerTwitchUserId === profile.twitchUserId)!;
  assert.equal(housesIn(other).find((h) => h.ownerTwitchUserId === "new-judge")!.id, home.id);
  assert.notEqual(world.streamerTwitchUserId, profile.twitchUserId);
});

test("per-login demo activation, save, reset and expiry never change other viewers or accept foreign ownership", () => {
  let now = 0; const store = new SubscriberDemoStore(() => true, () => now), profile = fixture().twitch.identity;
  assert.equal(store.read("login-a", profile), null);
  const a = store.activate("login-a", profile);
  assert.deepEqual(store.activate("login-a", profile), a);
  const draft = { ...exteriorOf(a.property.house), houseName: "Judges Cottage", roof: "rose" as const };
  const b = store.activate("login-b", { ...profile, twitchUserId: "second", displayName: "Second" });
  const saved = store.save("login-a", profile, a.property.house.id, a.property.revision, draft);
  assert.equal(exteriorOf(store.read("login-a", profile)!.property.house).houseName, "Judges Cottage");
  assert.deepEqual(store.read("login-b", { ...profile, twitchUserId: "second", displayName: "Second" }), b);
  assert.throws(() => store.read("login-a", { ...profile, twitchUserId: "second" }));
  const foreign = housesIn(a.world).find((h) => h.ownerTwitchUserId !== profile.twitchUserId)!;
  assert.throws(() => store.save("login-a", profile, foreign.id, saved.property.revision, draft));
  assert.throws(() => store.save("login-a", profile, "genuine-house", saved.property.revision, draft));
  assert.throws(() => store.save("login-a", profile, a.property.house.id, a.property.revision, draft));
  const reset = store.activate("login-a", profile, true);
  assert.equal(exteriorOf(reset.property.house).houseName, ""); assert.equal(reset.property.house.id, a.property.house.id);
  assert.throws(() => store.save("login-a", profile, a.property.house.id, saved.property.revision, draft));
  now = 8 * 60 * 60 * 1000; assert.equal(store.read("login-a", profile), null);
  assert.equal(new SubscriberDemoStore(() => true).read("login-a", profile), null);
});

test("demo HTTP requires a real authenticated session, same-origin CSRF and strict input; saves only assigned property", async () => {
  const f = fixture(), login = await f.login(), store = new SubscriberDemoStore(() => true);
  const handlers = subscriberDemoHandlers(() => f.service, store, () => true);
  const request = (method: string, body?: unknown, headers: Record<string, string> = {}) => new NextRequest("http://localhost:3000/api/demo/subscriber", {
    method, headers: { cookie: `${cookieNames(false).session}=${login.id}`, origin: f.config.origin, "x-csrf-token": f.service.csrfToken(login.id), "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await handlers.GET(request("GET", undefined, { cookie: "" }))).status, 401);
  assert.equal((await handlers.GET(request("GET", undefined, { cookie: `${cookieNames(false).session}=invalid` }))).status, 401);
  for (const headers of [{ origin: "null" }, { origin: "https://foreign.example" }, { "x-csrf-token": "forged" }, { "sec-fetch-site": "cross-site" }] as Record<string, string>[]) {
    assert.equal((await handlers.POST(request("POST", { action: "activate" }, headers))).status, 403);
  }
  assert.equal((await handlers.POST(request("POST", { action: "activate", twitchUserId: "someone-else" }))).status, 400);
  const response = await handlers.POST(request("POST", { action: "activate" })); assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const data = await response.json(); assert.equal(data.property.house.ownerTwitchUserId, f.twitch.identity.twitchUserId);
  const body = { houseId: data.property.house.id, revision: data.property.revision, exterior: { ...exteriorOf(data.property.house), houseName: "Saved by judge" } };
  assert.equal((await handlers.PATCH(request("PATCH", { ...body, houseId: housesIn(data.world)[0].id }))).status, 403);
  assert.equal((await handlers.PATCH(request("PATCH", { ...body, townId: "real-town" }))).status, 400);
  assert.equal((await handlers.PATCH(request("PATCH", body))).status, 200);
  assert.equal((await handlers.GET(request("GET"))).status, 200);
  assert.equal(f.twitch.exchanges.length, 1); // Fixture never authenticates a broadcaster or adds scopes.
  await f.service.signOut(login.id, f.service.csrfToken(login.id));
  assert.equal((await handlers.GET(request("GET"))).status, 401);
});

test("production and public deployment gates fail before auth or fixture access regardless of request flags", async () => {
  for (const env of [{ NODE_ENV: "production", TOWN_DEMO_MODE: "true" }, { NODE_ENV: "development", TOWN_DEMO_MODE: "true", PUBLIC_DEPLOYMENT: "true" }, { NODE_ENV: "development" }, { NODE_ENV: "test" }]) {
    const enabled = () => subscriberDemoEnabled(env);
    assert.equal(enabled(), false);
    const store = new SubscriberDemoStore(enabled);
    assert.throws(() => store.activate("session", fixture().twitch.identity));
    const handlers = subscriberDemoHandlers(() => { assert.fail("Disabled demo initialized auth"); }, store, enabled);
    for (const method of ["GET", "POST", "PATCH"] as const) {
      const request = new NextRequest("http://localhost:3000/api/demo/subscriber?demo=true&NODE_ENV=development", { method, headers: { "x-demo": "true", "x-node-env": "development" } });
      assert.equal((await handlers[method](request)).status, 404);
    }
  }
  assert.equal(subscriberDemoEnabled({ NODE_ENV: "development", TOWN_DEMO_MODE: "true" }), true);
  const remote = subscriberDemoHandlers(() => { assert.fail("Remote demo initialized auth"); }, new SubscriberDemoStore(() => true), () => true);
  assert.equal((await remote.GET(new NextRequest("https://public.example/api/demo/subscriber"))).status, 404);
});

test("fresh accounts and mixed-role accounts retain real Dashboard data alongside the separate simulated card", async () => {
  const f = fixture(), login = await f.login(), store = new SubscriberDemoStore(() => true);
  const demo = store.activate(login.id, f.twitch.identity);
  const genuine = { ...demo.property, simulated: undefined, townId: "real-town", townName: "Real Community", streamerName: "Real Streamer" };
  for (const owned of [false, true]) for (const hasHouses of [false, true]) {
    const town = owned ? { world: { ...demo.world, id: "owned-town", streamerTwitchUserId: f.twitch.identity.twitchUserId }, revision: 1, updatedAt: "now" } : null;
    const data = await dashboardAccess(f.service, () => ({ mine: async () => town, listOwnProperties: async () => hasHouses ? [genuine] : [] }) as unknown as TownPersistenceService, login.id);
    const html = renderToStaticMarkup(createElement(AccountDashboard, { data, subscriberDemo: true }));
    assert.match(html, /Try Subscriber Experience/); assert.match(html, /Development Demo/);
    if (owned) assert.match(html, /Manage My Town/); else assert.match(html, /Create My Town/);
    if (hasHouses) assert.match(html, /Real Community/);
    assert.equal(data.houses.length, hasHouses ? 1 : 0);
    const cards = renderToStaticMarkup(createElement(PropertyCards, { houses: [...data.houses, demo.property] }));
    assert.match(cards, /MaplebrookLive/); assert.match(cards, /Simulated Subscription/);
    assert.match(cards, /href="\/demo\/subscriber\/house"/); assert.match(cards, /href="\/demo\/subscriber\/town"/);
    if (hasHouses) assert.match(cards, /Real Community/);
    assert.ok(!renderToStaticMarkup(createElement(AccountDashboard, { data })).includes("Try Subscriber Experience"));
  }
  const unavailable = await dashboardAccess(f.service, () => { throw new Error("No Supabase configured"); }, login.id);
  assert.ok(unavailable.housesUnavailable && unavailable.townUnavailable);
  assert.match(renderToStaticMarkup(createElement(AccountDashboard, { data: unavailable, subscriberDemo: true })), /Try Subscriber Experience/);
});

test("existing editor controls and camera action work for demo and genuine property contracts", async () => {
  const store = new SubscriberDemoStore(() => true), data = store.activate("session", fixture().twitch.identity);
  for (const demo of [false, true]) {
    const html = renderToStaticMarkup(createElement(HouseEditor, { initial: data.property, demo, onFind() {}, onSave: async () => data.property }));
    for (const text of ["Find My House", "roof color", "wall color", "fence color", "Garden", "House name"]) assert.ok(html.includes(text));
  }
  assert.ok(houseFocusCamera(data.world, data.property.house.id, 1920, 1080));
  const [api, real, page, devEditor, canvas] = await Promise.all([
    readFile("src/app/api/demo/subscriber/route.ts", "utf8"), readFile("src/lib/houses/http.ts", "utf8"),
    readFile("src/app/demo/subscriber/layout.tsx", "utf8"), readFile("src/components/demo-house-editor.tsx", "utf8"), readFile("src/components/town-canvas.tsx", "utf8"),
  ]);
  assert.ok(!api.includes("persistence")); assert.ok(!real.includes("subscriber-demo"));
  assert.match(real, /saveOwnExterior\(profile, townId, houseId, body.revision, body.exterior, verify\)/);
  assert.match(page, /if \(!subscriberDemoEnabled\(\)\) notFound\(\)/);
  assert.match(page, /getProfile\(id\)/);
  assert.match(devEditor, /houseId: initial.house.id/); assert.match(canvas, /renderer.current\?\.focusHouse\(focusHouseId\)/);
});

test("genuine property APIs cannot consume the fixture as ownership or reach persistence with its town ID", async () => {
  const f = fixture(), login = await f.login(), store = new SubscriberDemoStore(() => true);
  const data = store.activate(login.id, f.twitch.identity);
  const handlers = createHouseHandlers(() => f.service, () => { assert.fail("Fixture entered real persistence"); }, async () => { assert.fail("Fixture requested real membership"); }, false);
  const target = { townId: MAPLEBROOK_ID, houseId: data.property.house.id };
  const headers = { cookie: `${cookieNames(false).session}=${login.id}`, origin: f.config.origin, "x-csrf-token": f.service.csrfToken(login.id), "Content-Type": "application/json" };
  const get = new NextRequest("http://localhost:3000/api/my-houses/demo-maplebrook/house", { headers });
  assert.equal((await handlers.get(get, target)).status, 400);
  const patch = new NextRequest(get.url, { method: "PATCH", headers, body: JSON.stringify({ revision: 1, exterior: exteriorOf(data.property.house) }) });
  assert.equal((await handlers.save(patch, target)).status, 400);
  assert.deepEqual(store.read(login.id, f.twitch.identity), data);
});

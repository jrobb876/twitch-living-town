import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test, { before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { SupabaseTownRepository, type RpcClient } from "./repository";
import { TownPersistenceService } from "./service";
import { parseDatabaseConfig } from "./config";
import { createTownHandlers } from "./http";
import { PersistenceError, type DurableEvent } from "./types";
import { fixture } from "../auth/test-fixtures";
import { cookieNames } from "../auth/config";
import { createWorld, housesIn, createSession } from "../simulation/world";
import { processEvent } from "../simulation/engine";
import { neighborhoodCount } from "../simulation/population";
import { createLiveView, projectLiveActivity } from "../chat/projection";
import { chatMessage, NOW } from "../chat/test-fixtures";
import { LiveChatFeed } from "../chat/feed";
import { validateWorld } from "./validation";
import { CHAT_SCOPE, SUBSCRIPTION_SCOPE } from "../auth/types";
import { ChatManager } from "../chat/manager";
import { createChatHandlers } from "../chat/http";
import { SubscriberHousingService } from "../subscribers/service";
import { createHousingHandlers } from "../subscribers/http";
import { TwitchSubscriptions } from "../subscribers/twitch";
import { HousingError, type VerifiedSubscriber } from "../subscribers/types";
import { subscriber, housingNotification } from "../subscribers/test-fixtures";
import { createHouseHandlers } from "../houses/http";
import { colors, exteriorOf } from "../houses/customization";
import { addDistrict } from "../simulation/expansion";
import { streamerAccess } from "./streamer-access";
import { personalityFor, mayorLooks, personalityNames } from "../mayor/presets";
import { OverlayService, hashOverlayToken } from "../overlay/service";
import { defaultDisplay, offlineActivity } from "../overlay/model";
import { createOverlayHandlers } from "../overlay/http";
import { dashboardAccess } from "./dashboard";
import { publicVisitWorld } from "./public-view";
import { townVisitPath, houseEditorPath } from "../houses/links";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import AccountDashboard from "../../components/account-dashboard";

const db = new PGlite();
before(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(await readFile("supabase/migrations/202610280001_persistent_towns.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610280002_subscriber_housing.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610280003_house_portal.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610290004_neighborhood_expansion.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610290005_obs_display.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610290006_durable_auth.sql", "utf8"));
});
after(async () => { await db.close(); });
// Actual PostgreSQL transactions/constraints; no network, env credentials or live DB.
const rpc: RpcClient = async (name, args) => {
  const keys = Object.keys(args);
  try {
    const result = await db.query<{ value: unknown }>(`select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(",")}) as value`,
      keys.map((key) => typeof args[key] === "object" && args[key] !== null ? JSON.stringify(args[key]) : args[key]));
    return { data: result.rows[0]?.value ?? null, error: null };
  } catch (error) { return { data: null, error: { code: (error as { code: string }).code } }; }
};
const repository = new SupabaseTownRepository(rpc), service = new TownPersistenceService(repository);
let nextUser = 10000;
const profile = () => ({ twitchUserId: String(nextUser++), displayName: "Synthetic streamer", login: "synthetic", profileImageUrl: null });
const create = async () => { const owner = profile(); return { owner, town: await service.create(owner, { name: "Test town", mayorName: "Mochi", seed: 42 }) }; };
const event = (townId: string, user = profile(), id = randomUUID()): Extract<DurableEvent, { type: "NEW_SUBSCRIBER" }> => ({ type: "NEW_SUBSCRIBER", id, townId, occurredAt: NOW, user: { twitchUserId: user.twitchUserId, displayName: user.displayName } });
const code = (expected: string) => (error: unknown) => error instanceof PersistenceError && error.code === expected;

test("OBS preferences and hashed grants persist separately; rotate/revoke isolate tenants and preserve expanded worlds", async () => {
  const { owner, town } = await create(), other = await create();
  const overlay = new OverlayService(rpc, service, offlineActivity, () => []);
  const settings = { ...defaultDisplay, mode: "spotlight" as const, background: "transparent" as const, side: "right" as const, scale: 1.3 };
  assert.deepEqual(await overlay.status(owner, town.world.id), { enabled: false, settings: defaultDisplay });
  await overlay.manage(owner, { action: "save", townId: town.world.id, settings });
  const grant = await overlay.manage(owner, { action: "rotate", townId: town.world.id });
  assert.match(grant.token!, /^[A-Za-z0-9_-]{43}$/);
  const storedHash = (await db.query<{ token_hash: string }>("select token_hash from public.living_town_displays where town_id=$1", [town.world.id])).rows[0].token_hash;
  assert.equal(storedHash, hashOverlayToken(grant.token!)); assert.notEqual(storedHash, grant.token);
  const restarted = new OverlayService(rpc, service, offlineActivity, () => []);
  assert.deepEqual(await restarted.status(owner, town.world.id), { enabled: true, settings });
  assert.deepEqual(await service.mine(owner), town, "OBS writes never touch canonical town or revision");
  await assert.rejects(overlay.status(other.owner, town.world.id), code("forbidden"));
  await assert.rejects(overlay.manage(other.owner, { action: "rotate", townId: town.world.id }), code("forbidden"));
  await assert.rejects(overlay.read(other.town.world.id, grant.token!, null), code("forbidden"));
  await assert.rejects(overlay.read(town.world.id, "malformed", null), code("forbidden"));
  const full = await overlay.read(town.world.id, grant.token!, null);
  assert.equal(full.world!.id, town.world.id); assert.deepEqual(full.settings, settings);
  assert.equal((await overlay.read(town.world.id, grant.token!, full.revision)).world, undefined);
  for (let i = 0; i < 11; i++) await service.applyVerifiedEvent({ source: "twitch_verified", event: event(town.world.id) });
  const expanded = await overlay.read(town.world.id, grant.token!, full.revision);
  assert.equal(expanded.world!.plots.length, 26); assert.deepEqual(expanded.settings, settings);
  assert.equal(expanded.population.actors.length, 11);
  assert.deepEqual((await overlay.read(town.world.id, grant.token!, expanded.revision)).population, expanded.population);
  assert.deepEqual(expanded.world!.residents, []);
  const rotated = await overlay.manage(owner, { action: "rotate", townId: town.world.id });
  await assert.rejects(overlay.read(town.world.id, grant.token!, expanded.revision), code("forbidden"));
  assert.equal((await overlay.read(town.world.id, rotated.token!, expanded.revision)).world, undefined);
  const saved = await service.mine(owner);
  await overlay.manage(owner, { action: "revoke", townId: town.world.id });
  await assert.rejects(overlay.read(town.world.id, rotated.token!, expanded.revision), code("forbidden"));
  assert.deepEqual(await service.mine(owner), saved); assert.deepEqual(await service.mine(other.owner), other.town);
  assert.deepEqual(await overlay.status(owner, town.world.id), { enabled: false, settings });
});

test("OBS HTTP requires owner session and CSRF for management; bearer grants only allow read-only visual access", async () => {
  const f = fixture(), owner = profile(); f.twitch.identity = owner; f.twitch.validation.userId = owner.twitchUserId;
  const login = await f.login(), town = await service.create(owner, { name: "OBS town", mayorName: "Nori" }), other = await create();
  const overlay = new OverlayService(rpc, service, offlineActivity, () => []), handlers = createOverlayHandlers(() => f.service, () => overlay, false);
  const body = { townId: town.world.id, action: "rotate" };
  const request = (value: unknown, headers: Record<string, string> = {}) => new NextRequest("http://localhost:3000/api/town/display", { method: "POST",
    headers: { cookie: `${cookieNames(false).session}=${login.id}`, origin: f.config.origin, "content-type": "application/json", "x-csrf-token": f.service.csrfToken(login.id), ...headers }, body: JSON.stringify(value) });
  assert.equal((await handlers.manage(request(body, { cookie: "" }))).status, 401);
  assert.equal((await handlers.manage(request(body, { "x-csrf-token": "bad" }))).status, 403);
  assert.equal((await handlers.manage(request(body, { origin: "https://other.example" }))).status, 403);
  assert.equal((await handlers.manage(request({ ...body, townId: other.town.world.id }))).status, 403);
  assert.equal((await handlers.manage(request({ ...body, ownerId: other.owner.twitchUserId }))).status, 400);
  assert.equal((await handlers.manage(request({ action: "save", townId: town.world.id, settings: { ...defaultDisplay, world: town.world } }))).status, 400);
  const response = await handlers.manage(request(body)), grant = await response.json(); assert.equal(response.status, 200);
  const context = { params: Promise.resolve({ townId: town.world.id }) };
  const read = (key: string) => new NextRequest(`http://localhost:3000/api/overlay/${town.world.id}`, { headers: { authorization: `Bearer ${key}` } });
  assert.equal((await handlers.manage(request(body, { cookie: "", authorization: `Bearer ${grant.token}` }))).status, 401);
  assert.equal((await handlers.read(read(""), context)).status, 403);
  const success = await handlers.read(read(grant.token), context); assert.equal(success.status, 200);
  assert.match(success.headers.get("cache-control")!, /no-store/); assert.equal(success.headers.get("vary"), "Authorization");
  const payload = JSON.stringify(await success.json());
  // Match the identity value, not coincidental digits inside an opaque random alias/epoch.
  for (const privateValue of [grant.token, login.id, '"csrfToken"', JSON.stringify(owner.twitchUserId), "test-access", "test-refresh"]) assert.ok(!payload.includes(privateValue));
  await handlers.manage(request({ ...body, action: "revoke" })); assert.equal((await handlers.read(read(grant.token), context)).status, 403);
  const unavailable = createOverlayHandlers(() => f.service, () => new OverlayService(async () => { throw new Error("private network detail"); }, service, offlineActivity, () => []), false);
  const failure = await unavailable.read(read(grant.token), context); assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes("private network detail"));
});

test("migration 005 grants only trusted RPC execution, rejects invalid SQL settings and rolls back accidental reruns", async () => {
  const { owner, town } = await create();
  for (const role of ["anon", "authenticated", "service_role"]) {
    const result = (await db.query<{ table_access: boolean; manage: boolean; read: boolean }>(`select
      has_table_privilege($1,'public.living_town_displays','SELECT,INSERT,UPDATE,DELETE') table_access,
      has_function_privilege($1,'public.living_town_display_manage(text,uuid,text,jsonb,text)','EXECUTE') manage,
      has_function_privilege($1,'public.living_town_display_read(uuid,text)','EXECUTE') read`, [role])).rows[0];
    assert.equal(result.table_access, false); assert.equal(result.manage, role === "service_role"); assert.equal(result.read, role === "service_role");
  }
  await db.exec("set role service_role");
  try {
    assert.equal((await rpc("living_town_display_manage", { p_id: town.world.id, p_owner: "not-owner", p_action: "rotate", p_hash: "a".repeat(64) })).error?.code, "LT403");
    assert.equal((await rpc("living_town_display_manage", { p_id: town.world.id, p_owner: owner.twitchUserId, p_action: "rotate", p_hash: "a".repeat(64) })).error, null);
    assert.equal((await rpc("living_town_display_read", { p_id: town.world.id, p_hash: "a".repeat(64) })).error, null);
    assert.equal((await rpc("living_town_display_manage", { p_id: town.world.id, p_owner: owner.twitchUserId, p_action: "save", p_settings: { ...defaultDisplay, mode: null } })).error?.code, "23514");
  } finally { await db.exec("reset role"); }
  const before = (await db.query("select * from public.living_town_displays where town_id=$1", [town.world.id])).rows;
  await assert.rejects(db.exec(await readFile("supabase/migrations/202610290005_obs_display.sql", "utf8")));
  await db.exec("rollback");
  assert.deepEqual((await db.query("select * from public.living_town_displays where town_id=$1", [town.world.id])).rows, before);
});

test("basic login can onboard deliberately; existing towns bypass onboarding and duplicate creates retain the original Mayor", async () => {
  const f = fixture(), owner = profile(); f.twitch.identity = owner; f.twitch.validation.userId = owner.twitchUserId;
  const login = await f.login(); assert.deepEqual(f.twitch.validation.scopes, []);
  const access = await streamerAccess(f.service, () => service, login.id);
  assert.equal(access.destination, "/onboarding"); assert.equal(access.town, null); assert.equal(await service.mine(owner), null);
  await assert.rejects(streamerAccess(f.service, () => service, undefined), (e: unknown) => (e as { code: string }).code === "unauthorized");
  const original = await service.create(owner, { name: "Willowbrook", mayorName: "Mochito", mayorAppearance: { preset: "orange" }, mayorPersonality: personalityFor("curious") });
  const duplicates = await Promise.all([service.create(owner, { name: "Replacement", mayorName: "Other" }), service.create(owner, { name: "Another", mayorName: "Another" })]);
  assert.ok(duplicates.every((town) => town.world.id === original.world.id));
  const next = await streamerAccess(f.service, () => service, login.id);
  assert.equal(next.destination, "/dashboard/town"); assert.deepEqual(next.town, original);
  assert.equal(next.town?.world.name, "Willowbrook"); assert.equal(next.town?.world.mayor.name, "Mochito");
});

test("all Mayor selections and town renames persist without changing expanded geometry, properties or event history", async () => {
  const { owner, town } = await create();
  for (let i = 0; i < 11; i++) await service.applyVerifiedEvent({ source: "twitch_verified", event: event(town.world.id) });
  let saved = (await service.mine(owner))!;
  const home = housesIn(saved.world).find((h) => h.ownerTwitchUserId)!;
  saved = await service.updateHouse(owner, town.world.id, home.id, saved.revision, { customization: { sign: "Keep my garden", garden: "herbs" } });
  const baseline = structuredClone(saved), receipts = (await db.query("select * from public.living_town_processed_events where town_id=$1 order by event_id", [town.world.id])).rows;
  for (const [i, preset] of mayorLooks.entries()) {
    const personality = personalityFor(personalityNames[i]);
    saved = await service.saveSettings(owner, town.world.id, saved.revision, { name: `Town ${i}`, mayor: { name: `Mayor ${i}`, appearance: { preset }, personality } });
    const loaded = (await new TownPersistenceService(new SupabaseTownRepository(rpc)).mine(owner))!;
    assert.deepEqual(loaded, saved);
    assert.deepEqual(loaded.world.mayor.appearance, { preset }); assert.deepEqual(loaded.world.mayor.personality, personality);
    const row = (await db.query<{ appearance: unknown; personality: unknown; name: string }>("select appearance,personality,name from public.living_town_mayors where town_id=$1", [town.world.id])).rows[0];
    assert.deepEqual(row, { appearance: { preset }, personality, name: `Mayor ${i}` });
    const { name: ignoredName, mayor: ignoredMayor, ...rest } = loaded.world;
    const { name: oldName, mayor: oldMayor, ...expected } = baseline.world;
    assert.ok(ignoredName && ignoredMayor && oldName && oldMayor); assert.deepEqual(rest, expected);
  }
  assert.deepEqual((await db.query("select * from public.living_town_processed_events where town_id=$1 order by event_id", [town.world.id])).rows, receipts);
  const [a, b] = await Promise.allSettled([
    service.saveSettings(owner, town.world.id, saved.revision, { name: "First", mayor: { name: "First" } }),
    service.saveSettings(owner, town.world.id, saved.revision, { name: "Second", mayor: { name: "Second" } }),
  ]);
  assert.equal([a, b].filter((r) => r.status === "fulfilled").length, 1);
  assert.ok([a, b].some((r) => r.status === "rejected" && code("conflict")(r.reason)));
});

test("legacy Mayor values survive renames; invalid names, presets and protected settings fail without writing", async () => {
  const { owner, town } = await create();
  const renamed = await service.saveSettings(owner, town.world.id, town.revision, { name: " Willowbrook ", mayor: { name: " Mochito " } });
  assert.equal(renamed.world.name, "Willowbrook"); assert.equal(renamed.world.mayor.name, "Mochito");
  assert.deepEqual(renamed.world.mayor.appearance, town.world.mayor.appearance);
  assert.deepEqual(renamed.world.mayor.personality, town.world.mayor.personality);
  const legacy = structuredClone(renamed.world); delete legacy.mayor.appearance; delete legacy.mayor.personality;
  assert.deepEqual(validateWorld(legacy), legacy, "reading missing optional settings does not rewrite saved state");
  for (const name of ["", "   ", "x".repeat(61), "bad\u0000name"]) {
    await assert.rejects(service.create(profile(), { name, mayorName: "Mayor" }), code("invalid_input"));
    await assert.rejects(service.create(profile(), { name: "Town", mayorName: name }), code("invalid_input"));
    await assert.rejects(service.saveSettings(owner, town.world.id, renamed.revision, { name, mayor: { name: "Mayor" } }), code("invalid_input"));
    await assert.rejects(service.saveSettings(owner, town.world.id, renamed.revision, { name: "Town", mayor: { name } }), code("invalid_input"));
  }
  for (const mayor of [{ name: "Mayor", species: "dog" }, { name: "Mayor", appearance: { preset: "remote-image" } }, { name: "Mayor", personality: { preset: "evil", energy: 1, curiosity: 0 } }])
    await assert.rejects(service.saveSettings(owner, town.world.id, renamed.revision, { name: "Town", mayor }), code("invalid_input"));
  await assert.rejects(service.saveSettings(profile(), town.world.id, renamed.revision, { name: "Stolen", mayor: { name: "Other" } }), code("forbidden"));
  await assert.rejects(service.saveSettings(owner, town.world.id, renamed.revision, { name: "Town", mayor: { name: "Mayor" }, seed: 9 }), code("invalid_input"));
  assert.deepEqual(await service.mine(owner), renamed);
});

test("onboarding/settings HTTP uses basic Twitch identity, strict bodies, CSRF, ownership and stale revision guards", async () => {
  const f = fixture(), owner = profile(); f.twitch.identity = owner; f.twitch.validation.userId = owner.twitchUserId;
  const login = await f.login(), handlers = createTownHandlers(() => f.service, () => service, false);
  const request = (method: string, body: unknown, headers: Record<string, string> = {}) => new NextRequest("http://localhost:3000/api/town/settings", { method,
    headers: { cookie: `${cookieNames(false).session}=${login.id}`, origin: "http://localhost:3000", "content-type": "application/json", "x-csrf-token": f.service.csrfToken(login.id), ...headers }, body: JSON.stringify(body) });
  const created = await handlers.create(request("POST", { name: "My town", mayorName: "Nori", mayorAppearance: { preset: "dark" }, mayorPersonality: personalityFor("calm") }));
  assert.equal(created.status, 200); const { town } = await created.json();
  const body = { townId: town.world.id, revision: town.revision, settings: { name: "New name", mayor: { name: "Nori" } } };
  assert.equal((await handlers.settings(request("PATCH", body, { cookie: "" }))).status, 401);
  assert.equal((await handlers.settings(request("PATCH", body, { "x-csrf-token": "wrong" }))).status, 403);
  assert.equal((await handlers.settings(request("PATCH", body, { origin: "https://elsewhere.example" }))).status, 403);
  assert.equal((await handlers.settings(request("PATCH", { ...body, ownerId: "999" }))).status, 400);
  const other = await create();
  assert.equal((await handlers.settings(request("PATCH", { ...body, townId: other.town.world.id }))).status, 403);
  assert.equal((await handlers.settings(request("PATCH", { ...body, settings: { ...body.settings, world: other.town.world } }))).status, 400);
  const success = await handlers.settings(request("PATCH", body)); assert.equal(success.status, 200); assert.match(success.headers.get("cache-control")!, /no-store/);
  assert.equal((await handlers.settings(request("PATCH", body))).status, 409);
  assert.deepEqual(await service.mine(other.owner), other.town);
});

test("growth SQL accepts all forty deterministic districts, including negative-coordinate expansion", async () => {
  const { town } = await create();
  let previous = town.world;
  for (let i = 0; i < 40; i++) {
    const next = validateWorld(addDistrict(previous));
    await db.query("select public.living_town_assert_growth($1::jsonb,$2::jsonb)", [JSON.stringify(previous), JSON.stringify(next)]);
    previous = next;
  }
  assert.equal(previous.plots.length, 494);
  assert.ok(previous.plots.some((p) => p.position.x < 0 && p.position.y < 0));
});

test("the backend rejects disconnected, dangling and one-way navigation before a world reaches the RPC", async () => {
  const { town } = await create(), expanded = addDistrict(town.world)!;
  const disconnected = structuredClone(expanded);
  for (const node of disconnected.layout.navigation) node.neighbors = node.neighbors.filter((id) => node.id.startsWith("neighborhood-") === id.startsWith("neighborhood-"));
  const dangling = structuredClone(expanded); dangling.layout.navigation[0].neighbors.push("missing-node");
  const oneWay = structuredClone(expanded); oneWay.layout.navigation.find((n) => n.id === "neighborhood-1:road:1-0")!.neighbors = ["neighborhood-1:road:1-1"];
  for (const world of [disconnected, dangling, oneWay]) assert.throws(() => validateWorld(world), code("incompatible"));
});

test("concurrent subscriptions at the reserve threshold append one district and preserve customized properties on reload", async () => {
  const { owner, town } = await create();
  for (let i = 0; i < 10; i++) await service.applyVerifiedEvent({ source: "twitch_verified", event: event(town.world.id) });
  let prior = (await service.mine(owner))!;
  const first = housesIn(prior.world).find((h) => h.ownerTwitchUserId)!;
  prior = await service.updateHouse(owner, town.world.id, first.id, prior.revision, { customization: { sign: "Preserved" } });
  prior = await service.saveMayor(owner, town.world.id, prior.revision, { name: "Nori", personality: { energy: 0.8, curiosity: 0.2 } });
  const a = event(town.world.id), b = event(town.world.id);
  const outcomes = await Promise.all([a, b, a].map((e) => service.applyVerifiedEvent({ source: "twitch_verified", event: e })));
  assert.equal(outcomes.filter((r) => r.status === "duplicate").length, 1);
  assert.ok(outcomes.every((r) => !r.expansionDeferred));
  let loaded = (await service.mine(owner))!;
  assert.equal(loaded.world.plots.length, 26); assert.equal(loaded.world.residents.length, 12);
  for (let i = 0; i < 6; i++) await Promise.all(Array.from({ length: 4 }, () => service.applyVerifiedEvent({ source: "twitch_verified", event: event(town.world.id) })));
  loaded = (await new TownPersistenceService(new SupabaseTownRepository(rpc)).mine(owner))!;
  assert.equal(loaded.world.plots.length, 50); assert.equal(loaded.world.residents.length, 36);
  assert.equal(new Set(housesIn(loaded.world).map((h) => h.plotId)).size, 36);
  assert.deepEqual(housesIn(loaded.world).find((h) => h.id === first.id), housesIn(prior.world).find((h) => h.id === first.id));
  assert.deepEqual(loaded.world.mayor, prior.world.mayor);
  assert.deepEqual(loaded.world.layout.roads.slice(0, prior.world.layout.roads.length), prior.world.layout.roads);
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.living_town_plots where town_id=$1", [town.world.id])).rows[0].count, 50);
  const independent = await create();
  for (let i = 0; i < 11; i++) await service.applyVerifiedEvent({ source: "twitch_verified", event: event(independent.town.world.id) });
  assert.equal((await service.mine(independent.owner))!.world.plots.length, 26);
  assert.deepEqual((await service.mine(owner))!, loaded);
});

test("a mid-projection database failure rolls back growth, preserves membership on the waitlist, and recovers on a new sync", async () => {
  const { owner, town } = await create();
  for (let i = 0; i < 14; i++) await service.applyVerifiedEvent({ source: "twitch_verified", event: event(town.world.id) }, false);
  const before = (await service.mine(owner))!, pending = event(town.world.id);
  await db.exec(`create function public.test_reject_growth() returns trigger language plpgsql as $$ begin raise exception 'synthetic projection failure'; end $$;
    create trigger test_reject_growth before insert on public.living_town_plots for each row
    when (new.town_id='${town.world.id}'::uuid and new.id like 'neighborhood-%') execute function public.test_reject_growth();`);
  try {
    const saved = await service.applyVerifiedEvent({ source: "twitch_verified", event: pending });
    assert.equal(saved.status, "saved"); assert.equal(saved.expansionDeferred, true);
    assert.equal(saved.town.world.residents.at(-1)?.housingStatus, "waiting");
    assert.equal(saved.town.world.residents.at(-1)?.isSubscriber, true);
    assert.deepEqual(saved.town.world.layout, before.world.layout);
    assert.equal(neighborhoodCount(saved.town.world), 1, "rolled-back growth is not a completed neighborhood");
    assert.deepEqual(saved.town.world.buildings, before.world.buildings);
    assert.equal(saved.town.revision, before.revision + 1, "only the fallback transaction commits");
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.living_town_districts where town_id=$1", [town.world.id])).rows[0].count, before.world.districts.length);
  } finally { await db.exec("drop trigger test_reject_growth on public.living_town_plots; drop function public.test_reject_growth();"); }
  assert.equal((await service.applyVerifiedEvent({ source: "twitch_verified", event: pending })).status, "duplicate");
  const recovered = await service.applyVerifiedEvent({ source: "twitch_verified", event: { ...pending, id: randomUUID() } });
  assert.equal(recovered.expansionDeferred, false); assert.equal(recovered.town.world.plots.length, 26);
  assert.equal(neighborhoodCount(recovered.town.world), 2);
  assert.equal(recovered.town.world.residents.length, 15); assert.equal(recovered.town.world.residents.at(-1)?.housingStatus, "housed");
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.living_town_processed_events where town_id=$1", [town.world.id])).rows[0].count, 16);
});

test("growth SQL rejects changed roads, removed districts, moved navigation and overlapping new plots atomically", async () => {
  const { owner, town } = await create(), added = addDistrict(town.world)!;
  const invalid = [structuredClone(added), structuredClone(added), structuredClone(added), structuredClone(added)];
  invalid[0].layout.roads[0].from.x++;
  invalid[1].districts.shift();
  invalid[2].layout.navigation[0].x++;
  invalid[3].plots[14].position = { ...invalid[3].plots[0].position };
  for (const world of invalid) {
    const receipt = { id: randomUUID(), type: "NEW_SUBSCRIBER", source: "twitch_verified", occurredAt: NOW, outcome: {} };
    await assert.rejects(db.query("select public.living_town_commit($1,$2::jsonb,$3,$4::jsonb)", [owner.twitchUserId, JSON.stringify(world), town.revision, JSON.stringify(receipt)]),
      (error: unknown) => ["LT409", "LT400"].includes((error as { code: string }).code));
  }
  await assert.rejects(repository.commit(owner.twitchUserId, { ...town, world: added }), code("conflict"));
  assert.deepEqual(await service.mine(owner), town);
  assert.equal((await db.query("select event_id from public.living_town_processed_events where town_id=$1", [town.world.id])).rows.length, 0);
  for (const role of ["anon", "authenticated", "service_role"]) {
    const row = (await db.query<{ allowed: boolean }>("select has_function_privilege($1,'public.living_town_assert_growth(jsonb,jsonb)','execute') as allowed", [role])).rows[0];
    assert.equal(row.allowed, false);
  }
});

test("a lost response after committed growth resolves through the receipt without a duplicate district or false deferral", async () => {
  const { owner, town } = await create();
  for (let i = 0; i < 10; i++) await service.applyVerifiedEvent({ source: "twitch_verified", event: event(town.world.id) });
  let interrupted = false;
  const uncertain = new TownPersistenceService(new SupabaseTownRepository(async (name, args) => {
    const result = await rpc(name, args);
    if (name === "living_town_commit" && !interrupted && !result.error) {
      interrupted = true; return { data: null, error: { code: "network_interrupted" } };
    }
    return result;
  }));
  const receipt = event(town.world.id), result = await uncertain.applyVerifiedEvent({ source: "twitch_verified", event: receipt });
  assert.equal(interrupted, true); assert.equal(result.status, "duplicate"); assert.equal(result.expansionDeferred, false);
  assert.equal(result.town.world.plots.length, 26); assert.equal(result.town.world.residents.length, 11);
  assert.equal((await service.applyVerifiedEvent({ source: "twitch_verified", event: receipt })).status, "duplicate");
  assert.deepEqual(await service.mine(owner), result.town);
});

test("town creation is deliberate, idempotent, independently owned, and reloads the saved world", async () => {
  const owner = profile(); assert.equal(await service.mine(owner), null);
  const [a, retry] = await Promise.all([service.create(owner, { name: "First town", mayorName: "Mochi", seed: 42 }), service.create(owner, { name: "Retry town", mayorName: "Other", seed: 99 })]);
  assert.equal(a.world.id, retry.world.id); assert.equal(a.world.seed, retry.world.seed);
  assert.equal(a.world.residents.length, 0); assert.equal(housesIn(a.world).length, 12);
  assert.ok(housesIn(a.world).every((house) => house.ownerTwitchUserId === null));
  const b = await create(); assert.notEqual(a.world.id, b.town.world.id);
  const reloaded = await new TownPersistenceService(new SupabaseTownRepository(rpc)).mine(owner);
  assert.deepEqual(reloaded, a);
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.living_town_plots where town_id=$1", [a.world.id])).rows[0].count, 14);
});

test("only an owner can save Mayor settings and stale revisions cannot overwrite a newer save", async () => {
  const { owner, town } = await create();
  await assert.rejects(service.saveMayor(profile(), town.world.id, town.revision, { name: "Intruder" }), code("forbidden"));
  const changed = await service.saveMayor(owner, town.world.id, town.revision, { name: "Nori", personality: { energy: 0.7, curiosity: 0.4 } });
  assert.equal(changed.world.mayor.name, "Nori"); assert.equal(changed.revision, 2);
  await assert.rejects(service.saveMayor(owner, town.world.id, town.revision, { name: "Stale" }), code("conflict"));
  assert.deepEqual((await service.mine(owner))?.world.layout, town.world.layout);
  await assert.rejects(repository.commit(profile().twitchUserId, changed), code("forbidden"));
});

test("duplicate verified events and simultaneous different subscribers allocate unique stable houses", async () => {
  const { owner, town } = await create(); const first = event(town.world.id), second = event(town.world.id);
  const results = await Promise.all([service.applyVerifiedEvent({ source: "twitch_verified", event: first }),
    service.applyVerifiedEvent({ source: "twitch_verified", event: first }), service.applyVerifiedEvent({ source: "twitch_verified", event: second })]);
  assert.equal(results.filter((result) => result.status === "duplicate").length, 1);
  const loaded = (await service.mine(owner))!;
  const owned = housesIn(loaded.world).filter((house) => house.ownerTwitchUserId);
  assert.equal(owned.length, 2); assert.equal(new Set(owned.map((house) => house.plotId)).size, 2);
  assert.equal(loaded.world.residents.length, 2);
  assert.deepEqual(loaded.world.layout, town.world.layout);
  assert.equal(housesIn(loaded.world).length, 12);
  assert.deepEqual(housesIn(loaded.world).map(({ ownerTwitchUserId, property, ...house }) => ({ ...house, customization: property?.customization ?? {}, owned: !!ownerTwitchUserId })),
    housesIn(town.world).map(({ ownerTwitchUserId, property, ...house }, i) => ({ ...house, customization: property?.customization ?? {}, owned: i < 2 || !!ownerTwitchUserId })));
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.living_town_processed_events where town_id=$1", [town.world.id])).rows[0].count, 2);
  const replay = await new TownPersistenceService(new SupabaseTownRepository(rpc)).applyVerifiedEvent({ source: "twitch_verified", event: first });
  assert.equal(replay.status, "duplicate"); assert.equal(replay.town.revision, loaded.revision);
});

test("one user can belong to independent towns; house updates preserve owner, identity and plot", async () => {
  const a = await create(), b = await create(), subscriber = profile();
  for (const town of [a.town, b.town]) await service.applyVerifiedEvent({ source: "twitch_verified", event: event(town.world.id, subscriber) });
  const loaded = (await service.mine(a.owner))!, house = housesIn(loaded.world).find((h) => h.ownerTwitchUserId === subscriber.twitchUserId)!;
  assert.equal((await service.assertHouseOwner(subscriber, loaded.world.id, house.id)).id, house.id);
  await assert.rejects(service.assertHouseOwner(profile(), loaded.world.id, house.id), code("forbidden"));
  await assert.rejects(service.updateHouse(subscriber, loaded.world.id, house.id, loaded.revision, { customization: { sign: "Hi" } }), code("forbidden"));
  await assert.rejects(service.updateHouse(a.owner, loaded.world.id, house.id, loaded.revision, { plotId: "other" }), code("invalid_input"));
  const changed = await service.updateHouse(a.owner, loaded.world.id, house.id, loaded.revision, { customization: { sign: "Hi" } });
  const saved = housesIn(changed.world).find((h) => h.id === house.id)!;
  assert.equal(saved.plotId, house.plotId); assert.equal(saved.ownerTwitchUserId, house.ownerTwitchUserId); assert.equal(saved.property?.customization.sign, "Hi");
  const secondReceipt = event(loaded.world.id, subscriber);
  await service.applyVerifiedEvent({ source: "twitch_verified", event: secondReceipt });
  assert.equal(housesIn((await service.mine(a.owner))!.world).filter((h) => h.ownerTwitchUserId === subscriber.twitchUserId).length, 1);
});

test("verified follower/subscription evidence and gift reconciliation survive reload without inventing history", async () => {
  const { owner, town } = await create(), person = profile();
  const identity = { twitchUserId: person.twitchUserId, displayName: person.displayName };
  const follower: DurableEvent = { type: "NEW_FOLLOWER", id: randomUUID(), townId: town.world.id, occurredAt: NOW, user: identity };
  await service.applyVerifiedEvent({ source: "twitch_verified", event: follower });
  const evidence = await db.query<{ follower_status: boolean; subscriber_status: boolean | null }>("select follower_status,subscriber_status from public.living_town_residents where town_id=$1", [town.world.id]);
  assert.deepEqual(evidence.rows[0], { follower_status: true, subscriber_status: null });
  const gifted: DurableEvent = { type: "NEW_SUBSCRIBER", id: randomUUID(), townId: town.world.id, occurredAt: NOW, user: identity,
    gift: { groupId: "gift-group", gifter: { twitchUserId: "999991", displayName: "Synthetic gifter" } } };
  await service.applyVerifiedEvent({ source: "twitch_verified", event: gifted });
  const aggregate: DurableEvent = { type: "GIFT_SUBSCRIPTION", id: randomUUID(), townId: town.world.id, occurredAt: NOW,
    groupId: "gift-group", gifter: gifted.gift!.gifter, total: 3, recipients: [] };
  await service.applyVerifiedEvent({ source: "twitch_verified", event: aggregate });
  const reloaded = (await service.mine(owner))!;
  assert.equal(reloaded.world.residents.length, 1); assert.equal(reloaded.world.giftGroups.length, 1);
  assert.equal(reloaded.world.giftGroups[0].announcedCount, 3); assert.equal(reloaded.world.giftGroups[0].recipientIds.length, 1);
  const firstHouse = reloaded.world.residents[0].houseId;
  await service.applyVerifiedEvent({ source: "twitch_verified", event: { type: "RESUBSCRIPTION", id: randomUUID(), townId: town.world.id, occurredAt: NOW, user: identity, cumulativeMonths: 7 } });
  const after = (await service.mine(owner))!;
  assert.equal(after.world.residents[0].houseId, firstHouse); assert.equal(after.world.residents[0].subscriptionMonths, 7);
});

test("an unclaimed starter house retains saved customization when a verified subscriber gets it", async () => {
  const { owner, town } = await create();
  const home = housesIn(town.world)[0];
  await service.updateHouse(owner, town.world.id, home.id, 1, { customization: { sign: "Welcome" } });
  for (let i = 0; i < 3; i++) await service.applyVerifiedEvent({ source: "twitch_verified", event: event(town.world.id) });
  const saved = housesIn((await service.mine(owner))!.world).find((house) => house.id === home.id)!;
  assert.ok(saved.ownerTwitchUserId); assert.equal(saved.property?.status, "verified_subscriber");
  assert.equal(saved.property?.customization.sign, "Welcome"); assert.deepEqual(saved.position, home.position);
});

test("persistent allocation fills twelve original cottages before construction and never takes a legacy home", async () => {
  const { owner, town } = await create(), cottages = housesIn(town.world);
  const first = event(town.world.id);
  let loaded = town;
  for (let i = 0; i < 12; i++) {
    const result = await service.applyVerifiedEvent({ source: "twitch_verified", event: i === 0 ? first : event(town.world.id) });
    loaded = result.town;
    assert.equal(housesIn(loaded.world).length, 12);
    assert.equal(loaded.world.residents.at(-1)!.houseId, cottages[i].id);
  }
  assert.equal(neighborhoodCount(loaded.world), 2);
  loaded = await service.updateHouse(owner, town.world.id, cottages[0].id, loaded.revision, { customization: { sign: "Keep forever" } });
  const resident = loaded.world.residents[0];
  loaded = (await service.applyVerifiedEvent({ source: "twitch_verified", event: { id: randomUUID(), townId: town.world.id, occurredAt: NOW + 1,
    type: "SUBSCRIPTION_ENDED", user: { twitchUserId: resident.twitchUserId, displayName: resident.displayName },
    subscription: { active: false, tier: "1000", isGift: false, source: "eventsub", verifiedAt: NOW + 1 } } })).town;
  const retained = structuredClone(housesIn(loaded.world));
  const next = event(town.world.id);
  const result = await service.applyVerifiedEvent({ source: "twitch_verified", event: next });
  assert.equal(result.status, "saved");
  assert.equal(housesIn(result.town.world).length, 13);
  assert.deepEqual(housesIn(result.town.world).slice(0, 12), retained);
  assert.equal(retained[0].property?.status, "legacy");
  assert.equal(retained[0].property?.customization.sign, "Keep forever");
  assert.equal(housesIn(result.town.world).at(-1)!.plotId, "plot-expansion-1");
  const duplicate = await service.applyVerifiedEvent({ source: "twitch_verified", event: next });
  assert.equal(duplicate.status, "duplicate"); assert.equal(duplicate.presentation, null);
  assert.deepEqual((await service.mine(owner))!.world, result.town.world);
});

test("SQL rejects relocation and duplicate plot allocation; entire event transaction rolls back", async () => {
  const { owner, town } = await create();
  const moved = structuredClone(town); moved.world.buildings[1].position.x++;
  await assert.rejects(repository.commit(owner.twitchUserId, moved), code("incompatible"));
  const broken = structuredClone(town), receipt = event(town.world.id);
  const house = structuredClone(housesIn(broken.world)[0]); house.id = "second-house-same-plot"; broken.world.buildings.push(house);
  // Bypass TypeScript validation to verify the database itself enforces uniqueness atomically.
  const invalid = await rpc("living_town_commit", { p_owner: owner.twitchUserId, p_world: JSON.parse(JSON.stringify(broken.world)), p_revision: broken.revision,
    p_event: { id: receipt.id, type: receipt.type, source: "twitch_verified", occurredAt: NOW,
      outcome: { eventId: receipt.id, type: receipt.type, status: "applied", message: "synthetic", houseIds: [], residentIds: [] } } });
  assert.equal(invalid.error?.code, "23505");
  assert.equal((await service.mine(owner))!.revision, 1);
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.living_town_processed_events where town_id=$1", [town.world.id])).rows[0].count, 0);
  const layout = structuredClone(town.world.layout); layout.hall.x++;
  await assert.rejects(service.saveLayout(owner, town.world.id, 1, layout), code("conflict"));
});

test("public projection omits residents, contributions, ownership and private user information", async () => {
  const { owner, town } = await create(); const subscriber = profile();
  await service.applyVerifiedEvent({ source: "twitch_verified", event: event(town.world.id, subscriber) });
  const value = await service.publicTown(town.world.id), serialized = JSON.stringify(value);
  for (const forbidden of ["streamerTwitchUserId", "ownerTwitchUserId", "residents", "processedEvents", "giftGroups", "subscriptionMonths", "customization", owner.twitchUserId, subscriber.twitchUserId]) assert.ok(!serialized.includes(forbidden));
});

test("RLS and privileges deny browser roles and helper RPCs; server role can use only the intended RPCs", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query("select * from public.living_towns"), (e: unknown) => (e as { code: string }).code === "42501");
      await assert.rejects(db.query("select public.living_town_project('{}'::jsonb)"), (e: unknown) => (e as { code: string }).code === "42501");
      if (role === "service_role") await db.query("select public.living_town_load(p_owner => '999999')");
      else await assert.rejects(db.query("select public.living_town_load(p_owner => '999999')"), (e: unknown) => (e as { code: string }).code === "42501");
    } finally { await db.exec("reset role"); }
  }
  const rows = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('living_towns','living_town_users','living_town_houses','living_town_processed_events')");
  assert.ok(rows.rows.every((r) => r.relrowsecurity));
});

test("database errors fail explicitly without a memory fallback or credential disclosure", async () => {
  for (const [upstream, expected] of [["PGRST202", "migration"], ["42P01", "migration"], ["XX000", "unavailable"]]) {
    const failing = new SupabaseTownRepository(async () => ({ data: null, error: { code: upstream, message: "secret" } }));
    await assert.rejects(failing.findByOwner("12345"), code(expected));
  }
  await assert.rejects(new SupabaseTownRepository(async () => { throw new Error("secret DB body"); }).load(randomUUID()), code("unavailable"));
  assert.throws(() => parseDatabaseConfig({}), code("configuration"));
  assert.throws(() => parseDatabaseConfig({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_publishable_synthetic" }), code("configuration"));
  assert.throws(() => parseDatabaseConfig({ SUPABASE_URL: "https://user:secret@example.com", SUPABASE_SECRET_KEY: "sb_secret_synthetic_value_only" }), code("configuration"));
  assert.equal(parseDatabaseConfig({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_synthetic_value_only" }).url, "https://example.supabase.co");
  const world = createWorld({ id: randomUUID(), streamerTwitchUserId: "12345", seed: 42, name: "Town", mayorName: "Mochi" });
  assert.throws(() => validateWorld({ ...world, generatorVersion: 2 }), code("incompatible"));
});

test("HTTP uses session identity, validates CSRF/body and does not create a town on read", async () => {
  const f = fixture(); f.twitch.identity = profile(); f.twitch.validation.userId = f.twitch.identity.twitchUserId;
  const login = await f.login(), handlers = createTownHandlers(() => f.service, () => service, false);
  const request = (method = "GET", body?: unknown, headers: Record<string, string> = {}) => new NextRequest("http://localhost:3000/api/town", { method,
    headers: { cookie: `${cookieNames(false).session}=${login.id}`, origin: "http://localhost:3000", "content-type": "application/json", "x-csrf-token": f.service.csrfToken(login.id), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal((await (await handlers.get(request())).json()).town, null);
  assert.equal((await handlers.create(request("POST", { name: "Mine", mayorName: "Mochi", ownerId: "999" }))).status, 400);
  assert.equal((await handlers.create(request("POST", { name: "Mine", mayorName: "Mochi" }, { "x-csrf-token": "wrong" }))).status, 403);
  assert.equal((await handlers.create(request("POST", { name: "Mine", mayorName: "Mochi" }, { origin: "https://evil.example" }))).status, 403);
  assert.equal((await handlers.create(request("POST", { name: "x".repeat(9000) }))).status, 400);
  const saved = await handlers.create(request("POST", { name: "Mine", mayorName: "Mochi" })); assert.equal(saved.status, 200);
  const payload = await saved.json(); assert.equal(payload.town.world.streamerTwitchUserId, f.twitch.identity.twitchUserId);
  assert.match(saved.headers.get("cache-control")!, /no-store/);
  const other = await create();
  assert.equal((await handlers.mayor(request("PATCH", { townId: other.town.world.id, revision: 1, settings: { name: "Intruder" } }))).status, 403);
  assert.equal((await handlers.get(request("GET", undefined, { cookie: "" }))).status, 401);
  const down = createTownHandlers(() => f.service, () => { throw new PersistenceError("unavailable"); }, false);
  const failure = await down.create(request("POST", { name: "Mine", mayorName: "Mochi" })); assert.equal(failure.status, 503);
  assert.equal((await failure.json()).error, "unavailable");
});

test("live chat projects onto saved layout without writes; demo events never become persistent events", async () => {
  const { owner, town } = await create(); const before = JSON.stringify(await service.mine(owner));
  const feed = new LiveChatFeed(owner.twitchUserId, NOW);
  feed.receive(chatMessage("live", owner.twitchUserId, "private text", owner.twitchUserId), NOW);
  const snapshot = { channel: owner, townId: `twitch:${owner.twitchUserId}`, authorized: true, status: "connected" as const,
    socketConnected: true, subscriptionReady: true, csrfToken: "synthetic", ...feed.snapshot(NOW) };
  const session = createLiveView(snapshot, 999, "Ignored", "Ignored", 0, town.world);
  const projected = projectLiveActivity(session, { ...snapshot, townId: town.world.id });
  assert.equal(projected.runtime.activity.score, 10); assert.equal(projected.world.seed, 42); assert.equal(projected.world, town.world);
  const demo = createSession(createWorld({ id: "demo-willowbrook", streamerTwitchUserId: "sim-streamer", seed: 99, name: "Demo", mayorName: "Mochi" }));
  processEvent(demo, { type: "NEW_SUBSCRIBER", id: "demo-event", townId: demo.world.id, occurredAt: 0, user: { twitchUserId: "sim-user", displayName: "Demo" } });
  await assert.rejects(service.applyVerifiedEvent({ source: "simulated" as "twitch_verified", event: event(town.world.id) }), code("invalid_input"));
  await assert.rejects(service.applyVerifiedEvent({ source: "twitch_verified", event: { ...event(town.world.id), townId: "demo-willowbrook" } }), code("invalid_input"));
  assert.equal(JSON.stringify(await service.mine(owner)), before);
});

async function housingSetup(persistence = service) {
  const f = fixture(), owner = profile(); f.twitch.identity = owner; f.twitch.validation.userId = owner.twitchUserId;
  f.twitch.validation.scopes = [CHAT_SCOPE, SUBSCRIPTION_SCOPE];
  const login = await f.login(), town = await persistence.create(owner, { name: "Subscriber town", mayorName: "Mochi", seed: 42 });
  let clock = NOW, pages: VerifiedSubscriber[][] = [[subscriber()]], failPage = -1;
  const api = new TwitchSubscriptions("synthetic-client");
  api.page = async (_, broadcaster, cursor, userId) => {
    assert.equal(broadcaster, owner.twitchUserId);
    if (userId) return { subscribers: pages.flat().filter((user) => user.twitchUserId === userId) };
    const page = Number(cursor ?? 0); if (page === failPage) throw new HousingError("unavailable");
    return { subscribers: pages[page] ?? [], cursor: page + 1 < pages.length ? String(page + 1) : undefined };
  };
  const housing = new SubscriberHousingService(f.service, () => persistence, api, () => clock);
  const grant = await housing.grant(login.id);
  const sync = async () => { await housing.startSync(grant); await housing.waitForSync(owner.twitchUserId); return housing.status(owner); };
  return { f, owner, login, town, api, housing, grant, sync,
    setPages(value: VerifiedSubscriber[][], fail = -1) { pages = value; failPage = fail; clock++; },
    advance(ms: number) { clock += ms; }, now: () => clock,
    async drain() {
      for (let i = 0; i < 1000; i++) {
        if (!(await housing.status(owner)).pendingEvents) { await housing.waitForSync(owner.twitchUserId); return; }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      assert.fail("Housing queue did not drain");
    },
  };
}

test("paged verified import, unchanged sync, customization and plot identity survive reload", async () => {
  const h = await housingSetup(); h.setPages([[subscriber("777"), subscriber("778")], [subscriber("777"), subscriber("779")]]);
  let status = await h.sync();
  assert.equal(status.lastSync?.status, "complete"); assert.equal(status.lastSync?.pages, 2);
  assert.equal(status.lastSync?.imported, 3); assert.equal(status.active, 3);
  const loaded = (await service.mine(h.owner))!, home = await service.ownHouse({ ...profile(), twitchUserId: "777" }, loaded.world.id);
  assert.ok(home);
  await service.updateHouse(h.owner, loaded.world.id, home.id, loaded.revision, { customization: { sign: "Kept" } });
  h.setPages([[subscriber("777"), subscriber("778")], [subscriber("779")]]);
  status = await h.sync(); assert.equal(status.lastSync?.unchanged, 3); assert.equal(status.lastSync?.imported, 0);
  const after = (await service.mine(h.owner))!;
  const kept = housesIn(after.world).find((house) => house.id === home.id)!;
  assert.equal(kept.property?.customization.sign, "Kept"); assert.equal(kept.plotId, home.plotId);
  assert.deepEqual(kept.position, home.position); assert.deepEqual(kept.appearance, home.appearance);
  assert.deepEqual(after.world.layout, h.town.world.layout); assert.equal(after.world.residents[0].subscriptionMonths, 0);
  const fresh = new SubscriberHousingService(h.f.service, () => service, h.api, h.now);
  assert.equal((await fresh.status(h.owner)).lastSync?.status, "complete");
  const evidence = await db.query<{ subscription_tier: string; subscriber_status: boolean; evidence_source: string }>("select subscription_tier,subscriber_status,evidence_source from public.living_town_residents where town_id=$1 and twitch_user_id='777'", [after.world.id]);
  assert.deepEqual(evidence.rows[0], { subscription_tier: "1000", subscriber_status: true, evidence_source: "sync" });
  assert.equal((await db.query("select summary from public.living_town_subscriber_syncs where town_id=$1", [after.world.id])).rows.length, 1);
});

test("failed/partial pages retain properties; only a full sync plus direct absence marks legacy", async () => {
  const h = await housingSetup(); await h.sync();
  h.setPages([[subscriber("778")], []], 1);
  const partial = await h.sync(); assert.equal(partial.lastSync?.status, "partial"); assert.equal(partial.active, 2); assert.equal(partial.legacy, 0);
  h.setPages([[]], 0); assert.equal((await h.sync()).lastSync?.status, "failed");
  h.setPages([[subscriber("778")]]); const complete = await h.sync();
  assert.equal(complete.lastSync?.status, "complete"); assert.equal(complete.active, 1); assert.equal(complete.legacy, 1);
  const retained = await service.ownHouse({ ...profile(), twitchUserId: "777" }, h.town.world.id);
  assert.equal(retained?.property?.status, "legacy");
  h.setPages([[subscriber("777"), subscriber("778")]]); await h.sync();
  const renewed = await service.ownHouse({ ...profile(), twitchUserId: "777" }, h.town.world.id);
  assert.equal(renewed?.id, retained?.id); assert.equal(renewed?.property?.status, "verified_subscriber");
});

test("subscriber sync expands full towns without moving houses or taking legacy properties", async () => {
  const h = await housingSetup(), users = Array.from({ length: 16 }, (_, i) => subscriber(String(700 + i)));
  h.setPages([users]); const first = await h.sync();
  assert.equal(first.verifiedHouses, 16); assert.equal(first.waitlisted, 0); assert.equal(first.lastSync?.waitlisted, 0); assert.equal(first.availablePlots, 10);
  assert.equal(first.presentations.filter((p) => p.effects.some((e) => e.kind === "neighborhood")).length, 1);
  const before = (await service.mine(h.owner))!;
  h.setPages([users.slice(1)]); const next = await h.sync();
  assert.equal(next.legacy, 1); assert.equal(next.waitlisted, 0); assert.equal(next.verifiedHouses, 16);
  const after = (await service.mine(h.owner))!;
  assert.deepEqual(after.world.layout, before.world.layout); assert.deepEqual(after.world.districts, before.world.districts); assert.deepEqual(after.world.plots, before.world.plots);
  assert.deepEqual(housesIn(after.world).map((v) => [v.id,v.ownerTwitchUserId,v.position]), housesIn(before.world).map((v) => [v.id,v.ownerTwitchUserId,v.position]));
  assert.equal(after.world.residents.length, 16);
});

test("paged sync and simultaneous verified delivery expand sequentially without duplicate properties on resync", async () => {
  const h = await housingSetup(), users = Array.from({ length: 30 }, (_, i) => subscriber(String(800 + i)));
  h.setPages([users.slice(0, 15), users.slice(15)]);
  await Promise.all([h.sync(), service.applyVerifiedEvent({ source: "twitch_verified", event: { ...event(h.town.world.id), user: { twitchUserId: users[29].twitchUserId, displayName: users[29].displayName } } })]);
  const before = (await service.mine(h.owner))!;
  assert.equal(before.world.plots.length, 38); assert.equal(before.world.residents.length, 30);
  assert.equal(new Set(housesIn(before.world).map((h) => h.ownerTwitchUserId)).size, 30);
  const repeated = await h.sync(); assert.equal(repeated.lastSync?.unchanged, 30); assert.equal(repeated.waitlisted, 0);
  const after = (await service.mine(h.owner))!;
  assert.deepEqual(after.world.layout, before.world.layout); assert.deepEqual(after.world.buildings, before.world.buildings);
});

test("gift aggregate celebrates once; verified recipients, API sync and duplicate deliveries share one house", async () => {
  const h = await housingSetup(); h.setPages([[{ ...subscriber(), isGift: true }]]);
  const gift = housingNotification("channel.subscription.gift", h.owner.twitchUserId, "anonymous-batch", h.now());
  gift.payload.event.is_anonymous = true; Object.assign(gift.payload.event, { user_id: null, user_name: null });
  h.housing.enqueue(h.owner, h.grant.key, gift); await h.drain();
  h.housing.enqueue(h.owner, h.grant.key, gift); await h.drain();
  const recipient = housingNotification("channel.subscribe", h.owner.twitchUserId, "recipient", h.now()); recipient.payload.event.is_gift = true;
  h.housing.enqueue(h.owner, h.grant.key, recipient); await h.drain();
  h.housing.enqueue(h.owner, h.grant.key, recipient); await h.drain(); await h.sync();
  const loaded = (await service.mine(h.owner))!;
  assert.equal(loaded.world.residents.length, 1); assert.equal(loaded.world.residents[0].twitchUserId, "777");
  assert.equal(housesIn(loaded.world).filter((house) => house.ownerTwitchUserId).length, 1);
  assert.equal(loaded.world.giftGroups.length, 1); assert.equal(loaded.world.giftGroups[0].gifter, null);
  assert.equal(loaded.world.giftGroups[0].announcedCount, 3); assert.deepEqual(loaded.world.giftGroups[0].recipientIds, []);
  assert.equal((await h.housing.status(h.owner)).presentations.filter((p) => p.effects.some((e) => e.kind === "gift")).length, 1);
});

test("resub message rechecks entitlement; cancellation retains customization and stale evidence cannot reactivate", async () => {
  const h = await housingSetup(); await h.sync();
  let saved = (await service.mine(h.owner))!; const home = housesIn(saved.world).find((v) => v.ownerTwitchUserId === "777")!;
  await service.updateHouse(h.owner, saved.world.id, home.id, saved.revision, { customization: { sign: "Permanent" } });
  h.advance(10);
  const resub = housingNotification("channel.subscription.message", h.owner.twitchUserId, "resub", h.now());
  h.housing.enqueue(h.owner, h.grant.key, resub); await h.drain();
  saved = (await service.mine(h.owner))!; assert.equal(saved.world.residents[0].subscriptionMonths, 7); assert.equal(saved.world.residents[0].houseId, home.id);
  h.advance(10);
  const ended = housingNotification("channel.subscription.end", h.owner.twitchUserId, "ended", h.now());
  h.housing.enqueue(h.owner, h.grant.key, ended); await h.drain();
  const stale = housingNotification("channel.subscribe", h.owner.twitchUserId, "delayed-subscribe", NOW);
  h.housing.enqueue(h.owner, h.grant.key, stale); await h.drain();
  h.setPages([[]]); resub.metadata.message_id = "resub-without-membership"; resub.metadata.message_timestamp = new Date(h.now()).toISOString();
  h.housing.enqueue(h.owner, h.grant.key, resub); await h.drain();
  saved = (await service.mine(h.owner))!;
  assert.equal(saved.world.residents[0].isSubscriber, false);
  const legacy = housesIn(saved.world).find((v) => v.id === home.id)!;
  assert.equal(legacy.property?.status, "legacy"); assert.equal(legacy.property?.customization.sign, "Permanent");
  assert.equal((await db.query<{ subscriber_status: boolean }>("select subscriber_status from public.living_town_residents where town_id=$1", [saved.world.id])).rows[0].subscriber_status, false);
});

test("housing controls enforce session/channel/CSRF and viewer lookup returns only the authenticated owner's house", async () => {
  const h = await housingSetup(); await h.sync();
  const manager = new ChatManager(h.f.service), handlers = createHousingHandlers(() => h.f.service, () => h.housing, () => manager, () => service, false);
  const request = (action?: unknown, headers: Record<string,string> = {}, query = "") => new NextRequest(`http://localhost:3000/api/subscribers${query}`, {
    method: action ? "POST" : "GET", headers: { cookie: `${cookieNames(false).session}=${h.login.id}`, origin: "http://localhost:3000", "content-type": "application/json", "x-csrf-token": h.f.service.csrfToken(h.login.id), ...headers },
    ...(action ? { body: JSON.stringify(action) } : {}),
  });
  assert.equal((await handlers.control(request({ action: "sync" }, { cookie: "" }))).status, 401);
  assert.equal((await handlers.control(request({ action: "sync" }, { "x-csrf-token": "wrong" }))).status, 403);
  assert.equal((await handlers.control(request({ action: "sync" }, { origin: "https://evil.example" }))).status, 403);
  assert.equal((await handlers.control(request({ action: "sync", broadcasterId: "999" }))).status, 400);
  const beforeForgery = await service.mine(h.owner);
  for (const forged of [
    { action: "sync", event: event(h.town.world.id), source: "twitch_verified" },
    { action: "sync", world: addDistrict(beforeForgery!.world) },
    { action: "NEW_SUBSCRIBER", user: subscriber("999") },
  ]) assert.equal((await handlers.control(request(forged))).status, 400);
  assert.deepEqual(await service.mine(h.owner), beforeForgery);
  const authorized = await handlers.control(request({ action: "authorize" }));
  assert.deepEqual(new Set(new URL((await authorized.json()).location).searchParams.get("scope")!.split(" ")), new Set([SUBSCRIPTION_SCOPE, CHAT_SCOPE]));
  const chat = createChatHandlers(() => h.f.service, () => manager, false);
  const upgraded = await chat.authorize(request({}));
  assert.deepEqual(new Set(new URL((await upgraded.json()).location).searchParams.get("scope")!.split(" ")), new Set([SUBSCRIPTION_SCOPE, CHAT_SCOPE]));
  assert.equal((await (await handlers.house(request(undefined, {}, `/house?townId=${h.town.world.id}&userId=777`))).json()).house, null);
  const viewer = { ...profile(), twitchUserId: "777" };
  assert.equal((await service.ownHouse(viewer, h.town.world.id))?.ownerTwitchUserId, "777");
  await assert.rejects(service.owned(viewer, h.town.world.id), code("forbidden"));
  const down = createHousingHandlers(() => h.f.service, () => { throw new PersistenceError("unavailable"); }, () => manager, () => service, false);
  assert.equal((await down.status(request())).status, 503);
  h.f.twitch.validation.scopes = []; await h.f.service.scopedSession(h.login.id, true);
  assert.equal((await handlers.control(request({ action: "sync" }))).status, 403);
  manager.dispose();
});

test("failed durable delivery retries transactionally, and failed sync never claims completion", async () => {
  let failWrites = false;
  const persistence = new TownPersistenceService(new SupabaseTownRepository(async (name, args) => {
    if (failWrites && name === "living_town_commit") return { data: null, error: { code: "XX000" } };
    return rpc(name, args);
  }));
  const h = await housingSetup(persistence); failWrites = true;
  assert.equal((await h.sync()).lastSync?.status, "failed");
  const input = housingNotification("channel.subscribe", h.owner.twitchUserId, "retry-after-db-failure", h.now());
  h.housing.enqueue(h.owner, h.grant.key, input);
  for (let i = 0; i < 100; i++) {
    if ((await h.housing.status(h.owner)).deliveryError) break;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal((await h.housing.status(h.owner)).deliveryError, "unavailable");
  assert.equal((await persistence.mine(h.owner))?.world.residents.length, 0);
  failWrites = false; h.advance(3000); h.housing.tick(); await h.drain();
  assert.equal((await h.housing.status(h.owner)).active, 1);
  assert.equal((await h.housing.status(h.owner)).deliveryError, null);
  h.housing.enqueue(h.owner, h.grant.key, input); await h.drain();
  assert.equal((await persistence.mine(h.owner))?.world.residents.length, 1);
});

async function portalFixture() {
  const first = await create(), second = await create(), member = profile();
  for (const { town } of [first, second]) {
    await service.applyVerifiedEvent({ source: "twitch_verified", event: { ...event(town.world.id, member), type: "NEW_SUBSCRIBER",
      subscription: { active: true, tier: "2000", isGift: false, verifiedAt: NOW, source: "sync" } } });
  }
  return { first, second, member, properties: await service.listOwnProperties(member) };
}
test("one login discovers pre-existing cross-town houses and can own a town without gaining foreign administration", async () => {
  const f = await portalFixture(), neighbor = profile();
  await service.applyVerifiedEvent({ source: "twitch_verified", event: { ...event(f.first.town.world.id, neighbor),
    subscription: { active: true, tier: "1000", isGift: false, verifiedAt: NOW, source: "sync" } } });
  // Both properties and their global identity were projected before this user's first OAuth login.
  assert.equal((await db.query("select twitch_user_id from public.living_town_users where twitch_user_id=$1", [f.member.twitchUserId])).rows.length, 1);
  const auth = fixture(); auth.twitch.identity = f.member; auth.twitch.validation.userId = f.member.twitchUserId;
  const login = await auth.login();
  assert.equal((await streamerAccess(auth.service, () => service, login.id)).destination, "/onboarding");
  const mine = await service.create(login.profile, { name: "My own town", mayorName: "Mochi", seed: 42 });
  assert.equal((await streamerAccess(auth.service, () => service, login.id)).town?.world.id, mine.world.id);
  const verified: string[][] = [];
  const handlers = createHouseHandlers(() => auth.service, () => service, async (broadcaster, user) => { verified.push([broadcaster, user]); }, false);
  const request = (body?: unknown) => new NextRequest("http://localhost:3000/api/my-houses?userId=999", {
    method: body ? "PATCH" : "GET", headers: { cookie: `${cookieNames(false).session}=${login.id}`,
      origin: "http://localhost:3000", "content-type": "application/json", "x-csrf-token": auth.service.csrfToken(login.id) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const response = await handlers.list(request()); assert.equal(response.status, 200);
  const listed = (await response.json()).houses as typeof f.properties;
  assert.deepEqual(listed.map((p) => p.townId).sort(), [f.first.town.world.id, f.second.town.world.id].sort());
  assert.ok(listed.every((p) => p.house.ownerTwitchUserId === f.member.twitchUserId && p.editable));
  const first = listed.find((p) => p.townId === f.first.town.world.id)!, second = listed.find((p) => p.townId === f.second.town.world.id)!;
  assert.equal(first.house.id, second.house.id, "House IDs can repeat safely across towns");
  const target = (p: typeof first) => ({ townId: p.townId, houseId: p.house.id });
  const draft = (p: typeof first, houseName: string) => ({ revision: p.revision, exterior: { ...exteriorOf(p.house), houseName } });
  assert.equal((await handlers.save(request(draft(first, "First cottage")), target(first))).status, 200);
  assert.deepEqual(await service.ownProperty(f.member, second.townId, second.house.id), second);
  assert.equal((await handlers.save(request(draft(second, "Second cottage")), target(second))).status, 200);
  assert.deepEqual(verified, [[f.first.owner.twitchUserId, f.member.twitchUserId], [f.second.owner.twitchUserId, f.member.twitchUserId]]);
  assert.equal((await service.ownProperty(f.member, first.townId, first.house.id)).house.property?.customization.houseName, "First cottage");
  assert.equal((await service.ownProperty(f.member, second.townId, second.house.id)).house.property?.customization.houseName, "Second cottage");
  const othersHouse = (await service.listOwnProperties(neighbor))[0], before = await service.mine(f.first.owner);
  assert.equal((await handlers.get(request(), target(othersHouse))).status, 403);
  assert.equal((await handlers.save(request(draft(othersHouse, "Forged")), target(othersHouse))).status, 403);
  await assert.rejects(service.saveMayor(login.profile, first.townId, before!.revision, { name: "Forged" }), code("forbidden"));
  assert.equal(verified.length, 2, "Wrong owners must fail before membership verification");
  assert.deepEqual(await service.mine(f.first.owner), before);
  assert.deepEqual(await service.mine(login.profile), mine);
});

test("subscriber reconciliation deduplicates within each town while independent membership expiry preserves the other town", async () => {
  const a = await housingSetup(), b = await housingSetup(), member = profile();
  const entry = subscriber(member.twitchUserId);
  a.setPages([[entry, entry]]); b.setPages([[entry], [entry]]);
  await Promise.all([a.sync(), b.sync()]);
  const initial = await service.listOwnProperties(member); assert.equal(initial.length, 2);
  await Promise.all([a.sync(), b.sync()]);
  const repeated = await service.listOwnProperties(member);
  assert.deepEqual(repeated.map((p) => [p.townId, p.house.id]).sort(), initial.map((p) => [p.townId, p.house.id]).sort());
  for (const h of [a, b]) {
    const town = (await service.mine(h.owner))!;
    assert.equal(town.world.residents.filter((r) => r.twitchUserId === member.twitchUserId).length, 1);
    assert.equal(housesIn(town.world).filter((house) => house.ownerTwitchUserId === member.twitchUserId).length, 1);
  }
  const untouched = await service.mine(b.owner);
  a.setPages([[]]); await a.sync();
  const ended = await service.listOwnProperties(member); assert.equal(ended.length, 2);
  assert.equal(ended.find((p) => p.townId === a.town.world.id)?.editable, false);
  assert.equal(ended.find((p) => p.townId === b.town.world.id)?.editable, true);
  assert.deepEqual(await service.mine(b.owner), untouched);
  a.setPages([[entry]]); await a.sync();
  const restored = await service.listOwnProperties(member); assert.ok(restored.every((p) => p.editable));
  assert.deepEqual(restored.map((p) => [p.townId, p.house.id]).sort(), initial.map((p) => [p.townId, p.house.id]).sort());
});

test("dashboard covers neither role, streamer only, subscriber only and both with correct cross-town actions", async () => {
  const f = await portalFixture(), auth = fixture();
  auth.twitch.identity = f.first.owner; auth.twitch.validation.userId = f.first.owner.twitchUserId;
  await auth.login(); // Optional broadcaster metadata already known to this server.
  async function as(user: ReturnType<typeof profile>) {
    auth.twitch.identity = user; auth.twitch.validation.userId = user.twitchUserId;
    const login = await auth.login();
    return dashboardAccess(auth.service, () => service, login.id);
  }
  const neither = await as(profile());
  assert.equal(neither.town, null); assert.deepEqual(neither.houses, []);
  const empty = renderToStaticMarkup(createElement(AccountDashboard, { data: neither }));
  assert.match(empty, /Create My Town/); assert.match(empty, /No houses are linked/);
  const streamer = await as(f.second.owner);
  assert.equal(streamer.town?.world.id, f.second.town.world.id); assert.deepEqual(streamer.houses, []);
  const streamerHtml = renderToStaticMarkup(createElement(AccountDashboard, { data: streamer }));
  assert.match(streamerHtml, /1 Neighborhood/);
  assert.match(streamerHtml, /Manage My Town/); assert.match(streamerHtml, /dashboard\/town#obs/);
  const subscriber = await as(f.member);
  assert.equal(subscriber.town, null); assert.equal(subscriber.houses.length, 2);
  assert.ok(subscriber.houses.every((p) => p.streamerName === "Synthetic streamer"));
  assert.equal(subscriber.townUnavailable, false); assert.equal(subscriber.housesUnavailable, false);
  const own = await service.create(f.member, { name: "Also my town", mayorName: "Mochi", seed: 42 });
  const both = await as(f.member); assert.equal(both.town?.world.id, own.world.id); assert.equal(both.houses.length, 2);
  const html = renderToStaticMarkup(createElement(AccountDashboard, { data: both }));
  for (const p of both.houses) {
    assert.ok(html.includes(`href="${townVisitPath(p.townId)}"`));
    assert.ok(html.includes(`href="${houseEditorPath(p.townId, p.house.id)}"`));
    assert.equal(p.house.ownerTwitchUserId, f.member.twitchUserId);
  }
  assert.match(html, /My Town/); assert.match(html, /My Houses/); assert.match(html, /Open Town Overview/);
  assert.ok(!html.includes("test-access")); assert.ok(!html.includes("encryptedTokens"));
  const legacy = renderToStaticMarkup(createElement(AccountDashboard, { data: { ...subscriber, houses: [{ ...subscriber.houses[0], editable: false, streamerName: undefined }] } }));
  assert.match(legacy, /View retained house/); assert.ok(!legacy.includes("Customize House")); assert.match(legacy, /name unavailable/);
});

test("dashboard denies anonymous identity before reads and keeps unavailable sections distinct from empty states", async () => {
  const auth = fixture();
  for (const id of [undefined, "forged"]) await assert.rejects(dashboardAccess(auth.service, () => { assert.fail("Private lookup before authentication"); }, id), (e: unknown) => (e as { code: string }).code === "unauthorized");
  const { owner, town } = await create(); auth.twitch.identity = owner; auth.twitch.validation.userId = owner.twitchUserId;
  const login = await auth.login();
  const broken = new TownPersistenceService(repository);
  broken.listOwnProperties = async () => { throw new PersistenceError("unavailable"); };
  const partial = await dashboardAccess(auth.service, () => broken, login.id);
  assert.equal(partial.town?.world.id, town.world.id); assert.equal(partial.housesUnavailable, true);
  const html = renderToStaticMarkup(createElement(AccountDashboard, { data: partial }));
  assert.match(html, /houses could not be loaded/); assert.ok(!html.includes("No houses are linked"));
  const unavailable = await dashboardAccess(auth.service, () => { throw new PersistenceError("configuration"); }, login.id);
  assert.equal(unavailable.townUnavailable, true); assert.equal(unavailable.housesUnavailable, true);
  assert.ok(!renderToStaticMarkup(createElement(AccountDashboard, { data: unavailable })).includes("Create My Town"));
  await auth.service.signOut(login.id, auth.service.csrfToken(login.id));
  await assert.rejects(dashboardAccess(auth.service, () => service, login.id), (e: unknown) => (e as { code: string }).code === "unauthorized");
});

test("town visits render only existing public data and retain the selected town's customized appearance", async () => {
  const f = await portalFixture(), p = f.properties[0];
  await service.saveOwnExterior(f.member, p.townId, p.house.id, p.revision, { ...exteriorOf(p.house), houseName: "Public cottage", door: "rose" }, async () => {});
  const view = publicVisitWorld(await service.publicTown(p.townId));
  assert.equal(view.id, p.townId); assert.equal(view.mayor.name, "Mochi");
  assert.deepEqual(view.residents, []); assert.deepEqual(view.processedEvents, []); assert.deepEqual(view.giftGroups, []);
  const house = housesIn(view).find((h) => h.id === p.house.id)!;
  assert.equal(house.ownerTwitchUserId, null); assert.equal(house.property?.customization.houseName, "Public cottage");
  assert.equal(house.property?.customization.doorColor, colors.rose);
  assert.ok(!JSON.stringify(view).includes('"subscription"'));
  assert.ok(!JSON.stringify(view).includes('"ownerTwitchUserId":"'));
  assert.equal(houseEditorPath(p.townId, "house/with?#chars"), `/my-houses/${p.townId}/house%2Fwith%3F%23chars`);
});

test("portal finds only the authenticated user's properties across multiple towns, including retained legacy homes", async () => {
  const f = await portalFixture(); assert.equal(f.properties.length, 2); assert.ok(f.properties.every((p) => p.editable));
  assert.deepEqual(await service.listOwnProperties(profile()), []);
  const p = f.properties.find((item) => item.townId === f.first.town.world.id)!;
  await assert.rejects(service.ownProperty(profile(), p.townId, p.house.id), code("forbidden"));
  await service.applyVerifiedEvent({ source: "twitch_verified", event: { type: "SUBSCRIPTION_ENDED", id: randomUUID(), townId: p.townId, occurredAt: NOW + 1, user: { twitchUserId: f.member.twitchUserId, displayName: f.member.displayName },
    subscription: { active: false, tier: "2000", isGift: false, verifiedAt: NOW + 1, source: "eventsub" } } });
  const next = await service.listOwnProperties(f.member); assert.equal(next.length, 2);
  assert.equal(next.find((item) => item.townId === p.townId)?.editable, false);
  await assert.rejects(service.saveOwnExterior(f.member, p.townId, p.house.id, (await service.mine(f.first.owner))!.revision, exteriorOf(p.house), async () => { assert.fail("Legacy house must be rejected before verification"); }), code("forbidden"));
});
test("portal save persists presets and preserves protected metadata, layout and another town", async () => {
  const f = await portalFixture(), p = f.properties.find((item) => item.townId === f.first.town.world.id)!;
  let town = (await service.mine(f.first.owner))!;
  const home = housesIn(town.world).find((item) => item.id === p.house.id)!;
  home.property!.size = "medium"; home.property!.prestige = 3; home.property!.customization.keepsake = "Retain me";
  town = (await repository.commit(f.first.owner.twitchUserId, town)).town;
  const original = structuredClone(housesIn(town.world).find((item) => item.id === home.id)!);
  const other = await service.mine(f.second.owner); let verified = 0;
  const draft = { ...exteriorOf(original), houseName: "Mochi Cottage", roof: "rose" as const, wall: "cream" as const, door: "sage" as const, garden: "stones" as const, accent: "birdhouse" as const };
  const result = await service.saveOwnExterior(f.member, p.townId, home.id, town.revision, draft, async (owner, member) => {
    verified++; assert.equal(owner, f.first.owner.twitchUserId); assert.equal(member, f.member.twitchUserId);
  });
  assert.equal(verified, 1); assert.equal(result.house.appearance.roofColor, colors.rose); assert.equal(result.house.appearance.wallColor, colors.cream);
  assert.equal(result.house.property?.size, "medium"); assert.equal(result.house.property?.prestige, 3);
  assert.equal(result.house.property?.customization.keepsake, "Retain me"); assert.equal(result.house.property?.customization.houseName, "Mochi Cottage");
  for (const key of ["id", "plotId", "ownerTwitchUserId", "position"] as const) assert.deepEqual(result.house[key], original[key]);
  const fresh = new TownPersistenceService(new SupabaseTownRepository(rpc));
  assert.deepEqual(await fresh.ownProperty(f.member, p.townId, home.id), result);
  assert.deepEqual((await service.mine(f.first.owner))!.world.layout, town.world.layout); assert.deepEqual(await service.mine(f.second.owner), other);
  const publicView = await service.publicTown(p.townId);
  assert.ok(JSON.stringify(publicView).includes("Mochi Cottage")); assert.ok(!JSON.stringify(publicView).includes("Retain me"));
  await assert.rejects(service.saveOwnExterior(f.member, p.townId, home.id, town.revision, draft, async () => {}), code("conflict"));
});
test("portal denies unauthorized, unknown entitlement, forbidden fields and failed verification without writing", async () => {
  const f = await portalFixture(), p = f.properties[0], before = await service.ownProperty(f.member, p.townId, p.house.id);
  const draft = exteriorOf(p.house); let called = false;
  const verify = async () => { called = true; };
  await assert.rejects(service.saveOwnExterior(profile(), p.townId, p.house.id, p.revision, draft, verify), code("forbidden"));
  for (const field of ["ownerTwitchUserId", "plotId", "prestige", "size", "appearance"]) {
    await assert.rejects(service.saveOwnExterior(f.member, p.townId, p.house.id, p.revision, { ...draft, [field]: "forged" }, verify), code("invalid_input"));
  }
  assert.equal(called, false);
  for (const failure of ["forbidden", "unavailable"] as const) await assert.rejects(service.saveOwnExterior(f.member, p.townId, p.house.id, p.revision, draft, async () => { throw new PersistenceError(failure); }), code(failure));
  assert.deepEqual(await service.ownProperty(f.member, p.townId, p.house.id), before);
  const old = await create(), unknown = profile();
  await service.applyVerifiedEvent({ source: "twitch_verified", event: event(old.town.world.id, unknown) });
  const oldProperty = (await service.listOwnProperties(unknown))[0]; assert.equal(oldProperty.editable, false);
});
test("a subscription ending during verification wins over a conflicting customization save", async () => {
  const f = await portalFixture(), p = f.properties[0];
  await assert.rejects(service.saveOwnExterior(f.member, p.townId, p.house.id, p.revision, { ...exteriorOf(p.house), houseName: "Should not save" }, async () => {
    await service.applyVerifiedEvent({ source: "twitch_verified", event: { type: "SUBSCRIPTION_ENDED", id: randomUUID(), townId: p.townId, occurredAt: NOW + 1, user: { twitchUserId: f.member.twitchUserId, displayName: f.member.displayName },
      subscription: { active: false, tier: "2000", isGift: false, verifiedAt: NOW + 1, source: "eventsub" } } });
  }), code("conflict"));
  const after = await service.ownProperty(f.member, p.townId, p.house.id); assert.equal(after.editable, false);
  assert.notEqual(after.house.property?.customization.houseName, "Should not save");
});
test("house HTTP resolves session identity, rejects forged bodies and CSRF, and keeps demo writes out", async () => {
  const f = await portalFixture(), auth = fixture(); auth.twitch.identity = f.member; auth.twitch.validation.userId = f.member.twitchUserId;
  const login = await auth.login(), p = f.properties[0]; let checks = 0;
  const handlers = createHouseHandlers(() => auth.service, () => service, async () => { checks++; }, false);
  const request = (method = "GET", body?: unknown, headers: Record<string,string> = {}) => new NextRequest("http://localhost:3000/api/my-houses?userId=999", { method,
    headers: { cookie: `${cookieNames(false).session}=${login.id}`, origin: "http://localhost:3000", "content-type": "application/json", "x-csrf-token": auth.service.csrfToken(login.id), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const target = { townId: p.townId, houseId: p.house.id }, body = { revision: p.revision, exterior: { ...exteriorOf(p.house), houseName: "HTTP Cottage" } };
  assert.equal((await handlers.list(request("GET", undefined, { cookie: "" }))).status, 401);
  assert.equal((await (await handlers.list(request())).json()).houses.length, 2);
  assert.equal((await handlers.save(request("PATCH", body, { "x-csrf-token": "bad" }), target)).status, 403);
  assert.equal((await handlers.save(request("PATCH", body, { origin: "https://evil.example" }), target)).status, 403);
  assert.equal((await handlers.save(request("PATCH", { ...body, userId: f.member.twitchUserId }), target)).status, 400);
  assert.equal((await handlers.save(request("PATCH", body), { ...target, townId: "demo-house-editor" })).status, 400);
  assert.equal(checks, 0);
  const saved = await handlers.save(request("PATCH", body), target); assert.equal(saved.status, 200); assert.equal(checks, 1);
  assert.match(saved.headers.get("cache-control")!, /no-store/);
  assert.equal((await (await handlers.get(request(), target)).json()).property.house.property.customization.houseName, "HTTP Cottage");
});
test("migration 003 grants only the server role the indexed multi-town lookup", async () => {
  const f = await portalFixture();
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec(`set role ${role}`);
    try {
      const query = () => db.query<{ ids: string[] }>("select public.living_town_owned_towns($1) as ids", [f.member.twitchUserId]);
      if (role === "service_role") assert.equal((await query()).rows[0].ids.length, 2);
      else await assert.rejects(query(), (e: unknown) => (e as { code: string }).code === "42501");
    } finally { await db.exec("reset role"); }
  }
});

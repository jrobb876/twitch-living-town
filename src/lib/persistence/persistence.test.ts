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
import { createLiveView, projectLiveActivity } from "../chat/projection";
import { chatMessage, NOW } from "../chat/test-fixtures";
import { LiveChatFeed } from "../chat/feed";
import { validateWorld } from "./validation";

const db = new PGlite();
before(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(await readFile("supabase/migrations/202610280001_persistent_towns.sql", "utf8"));
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
const event = (townId: string, user = profile(), id = randomUUID()): DurableEvent => ({ type: "NEW_SUBSCRIBER", id, townId, occurredAt: NOW, user: { twitchUserId: user.twitchUserId, displayName: user.displayName } });
const code = (expected: string) => (error: unknown) => error instanceof PersistenceError && error.code === expected;

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
  assert.deepEqual(housesIn(loaded.world).slice(0, 12), housesIn(town.world));
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

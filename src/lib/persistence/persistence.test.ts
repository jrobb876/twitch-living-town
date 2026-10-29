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
import { CHAT_SCOPE, SUBSCRIPTION_SCOPE } from "../auth/types";
import { ChatManager } from "../chat/manager";
import { createChatHandlers } from "../chat/http";
import { SubscriberHousingService } from "../subscribers/service";
import { createHousingHandlers } from "../subscribers/http";
import { TwitchSubscriptions } from "../subscribers/twitch";
import { HousingError, type VerifiedSubscriber } from "../subscribers/types";
import { subscriber, housingNotification } from "../subscribers/test-fixtures";

const db = new PGlite();
before(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(await readFile("supabase/migrations/202610280001_persistent_towns.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610280002_subscriber_housing.sql", "utf8"));
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

test("full towns waitlist verified subscribers without moving houses or taking legacy properties", async () => {
  const h = await housingSetup(), users = Array.from({ length: 16 }, (_, i) => subscriber(String(700 + i)));
  h.setPages([users]); const first = await h.sync();
  assert.equal(first.verifiedHouses, 14); assert.equal(first.waitlisted, 2); assert.equal(first.lastSync?.waitlisted, 2); assert.equal(first.availablePlots, 0);
  const before = (await service.mine(h.owner))!;
  h.setPages([users.slice(1)]); const next = await h.sync();
  assert.equal(next.legacy, 1); assert.equal(next.waitlisted, 2); assert.equal(next.verifiedHouses, 14);
  const after = (await service.mine(h.owner))!;
  assert.deepEqual(after.world.layout, before.world.layout); assert.deepEqual(after.world.districts, before.world.districts); assert.deepEqual(after.world.plots, before.world.plots);
  assert.deepEqual(housesIn(after.world).map((v) => [v.id,v.ownerTwitchUserId,v.position]), housesIn(before.world).map((v) => [v.id,v.ownerTwitchUserId,v.position]));
  assert.equal(after.world.residents.length, 16);
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

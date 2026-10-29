import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { SupabaseTownRepository, type RpcClient } from "./repository";
import { TownPersistenceService } from "./service";
import { PersistenceError } from "./types";
import { housesIn } from "../simulation/world";

// This database is disposable and has no connection string or environment access.
test("migration 002 preserves populated 001 data and the least-privilege RPC boundary", async (t) => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;");
    // Exercise revocations even when the platform gives new tables broad defaults.
    await db.exec("alter default privileges in schema public grant all on tables to anon,authenticated,service_role;");
    const migration1 = await readFile("supabase/migrations/202610280001_persistent_towns.sql", "utf8");
    const migration2 = await readFile("supabase/migrations/202610280002_subscriber_housing.sql", "utf8");
    await db.exec(migration1);
    const rpc: RpcClient = async (name, args) => {
      const keys = Object.keys(args);
      await db.exec("set role service_role");
      try {
        const result = await db.query<{ value: unknown }>(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")}) as value`,
          keys.map((key) => typeof args[key] === "object" && args[key] !== null ? JSON.stringify(args[key]) : args[key]));
        return { data: result.rows[0]?.value ?? null, error: null };
      } catch (error) { return { data: null, error: { code: (error as { code: string }).code } }; }
      finally { await db.exec("reset role"); }
    };
    const repository = new SupabaseTownRepository(rpc), service = new TownPersistenceService(repository);
    const owner = { twitchUserId: "101", displayName: "Fixture owner", login: "fixture", profileImageUrl: null };
    const viewer = { ...owner, twitchUserId: "202" };
    const user = { twitchUserId: "303", displayName: "Fixture subscriber" }, at = 1793102400000;
    const town = await service.create(owner, { name: "Existing town", mayorName: "Original Mayor", seed: 42 });
    await service.applyVerifiedEvent({ source: "twitch_verified", event: { id: "old-sub", type: "NEW_SUBSCRIBER", townId: town.world.id, occurredAt: at, user } });
    await service.applyVerifiedEvent({ source: "twitch_verified", event: { id: "old-follower", type: "NEW_FOLLOWER", townId: town.world.id, occurredAt: at, user: { twitchUserId: "404", displayName: "Fixture follower" } } });
    let saved = (await service.mine(owner))!;
    const home = housesIn(saved.world).find((house) => house.ownerTwitchUserId === user.twitchUserId)!;
    saved = await service.updateHouse(owner, saved.world.id, home.id, saved.revision, { customization: { sign: "Keep this", flowerBox: true } });
    saved = await service.saveMayor(owner, saved.world.id, saved.revision, { name: "Nori", appearance: { preset: "default" }, personality: { energy: 0.8, curiosity: 0.2 } });
    const tables = ["living_towns", "living_town_users", "living_town_mayors", "living_town_districts", "living_town_plots", "living_town_houses", "living_town_residents", "living_town_processed_events"];
    async function snapshot(includeSync = false) {
      const values: Record<string, unknown> = {};
      for (const table of [...tables, ...(includeSync ? ["living_town_subscriber_syncs"] : [])]) {
        // Only the new nullable evidence columns are absent from 001's rows.
        values[table] = (await db.query(`select to_jsonb(row) - 'subscription_tier' - 'is_gift' - 'evidence_source' as data from public.${table} row order by data`)).rows;
      }
      return values;
    }
    const before = await snapshot();
    await db.exec(migration2);

    await t.test("upgrade changes no existing rows, world, layout, property customization or Mayor settings", async () => {
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(await service.mine(owner), saved);
      assert.equal((await db.query("select * from public.living_town_subscriber_syncs")).rows.length, 0);
      const functions = await db.query<{ prosecdef: boolean; proconfig: string[]; same_owner: boolean }>(
        "select p.prosecdef,p.proconfig,p.proowner=c.relowner as same_owner from pg_proc p join pg_class c on c.oid='public.living_town_subscriber_syncs'::regclass where p.oid='public.living_town_project(jsonb)'::regprocedure");
      assert.equal(functions.rows[0].prosecdef, true); assert.equal(functions.rows[0].same_owner, true);
      assert.ok(functions.rows[0].proconfig.includes('search_path=""'));
    });

    await t.test("browser roles cannot call RPCs; even service_role cannot directly access the helper or sync table", async () => {
      const denied = (error: unknown) => (error as { code: string }).code === "42501";
      for (const role of ["anon", "authenticated", "service_role"]) {
        await db.exec(`set role ${role}`);
        try {
          await assert.rejects(db.query("select * from public.living_town_subscriber_syncs"), denied);
          await assert.rejects(db.query("select public.living_town_project($1::jsonb)", [JSON.stringify(saved.world)]), denied);
          await assert.rejects(db.query("select public.living_town_envelope($1::uuid)", [saved.world.id]), denied);
          for (const signature of ["living_town_load(uuid,text)", "living_town_create(jsonb,jsonb)", "living_town_commit(text,jsonb,bigint,jsonb)"]) {
            const result = await db.query<{ allowed: boolean }>("select has_function_privilege(current_user,$1,'execute') as allowed", [`public.${signature}`]);
            assert.equal(result.rows[0].allowed, role === "service_role");
          }
          if (role !== "service_role") {
            await assert.rejects(db.query("select public.living_town_load(p_owner => '101')"), denied);
            await assert.rejects(db.query("select public.living_town_create('{}','{}')"), denied);
            await assert.rejects(db.query("select public.living_town_commit('101',$1::jsonb,1)", [JSON.stringify(saved.world)]), denied);
          }
        } finally { await db.exec("reset role"); }
      }
      assert.equal((await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid='public.living_town_subscriber_syncs'::regclass")).rows[0].relrowsecurity, true);
    });

    await t.test("server RPCs write sync and inactive evidence while preserving property identity and enforcing ownership", async () => {
      const forbidden = (error: unknown) => error instanceof PersistenceError && error.code === "forbidden";
      await assert.rejects(service.saveMayor(viewer, saved.world.id, saved.revision, { name: "Intruder" }), forbidden);
      await assert.rejects(repository.commit(viewer.twitchUserId, saved), forbidden);
      const forged = structuredClone(saved); forged.world.streamerTwitchUserId = viewer.twitchUserId;
      await assert.rejects(repository.commit(viewer.twitchUserId, forged), forbidden);
      const moved = structuredClone(saved); moved.world.buildings[0].position.x++;
      await assert.rejects(repository.commit(owner.twitchUserId, moved), (e: unknown) => e instanceof PersistenceError && e.code === "conflict");
      const other = await service.create(viewer, { name: "Another town", mayorName: "Mochi", seed: 43 });
      const summary = { id: randomUUID(), status: "complete", startedAt: at, finishedAt: at + 1, imported: 1, updated: 0, unchanged: 0, waitlisted: 0, failed: 0, pages: 1, error: null };
      await service.saveSync(owner, saved.world.id, summary);
      await service.applyVerifiedEvent({ source: "twitch_verified", event: { id: "end", type: "SUBSCRIPTION_ENDED", townId: saved.world.id, occurredAt: at + 2, user,
        subscription: { active: false, tier: "2000", isGift: true, verifiedAt: at + 2, source: "eventsub" } } });
      const ended = (await service.mine(owner))!;
      assert.deepEqual(ended.world.layout, saved.world.layout); assert.deepEqual(ended.world.plots, saved.world.plots);
      assert.deepEqual(ended.world.mayor, saved.world.mayor); assert.equal(ended.world.residents.length, saved.world.residents.length);
      const retained = housesIn(ended.world).find((house) => house.id === home.id)!;
      const original = housesIn(saved.world).find((house) => house.id === home.id)!;
      assert.deepEqual(retained, { ...original, property: { ...original.property, status: "legacy" } });
      assert.deepEqual((await db.query<{ summary: unknown }>("select summary from public.living_town_subscriber_syncs where town_id=$1", [saved.world.id])).rows[0].summary, summary);
      const statuses = await db.query<{ subscriber_status: boolean | null }>("select subscriber_status from public.living_town_residents where town_id=$1 order by twitch_user_id", [saved.world.id]);
      assert.deepEqual(statuses.rows.map((row) => row.subscriber_status), [false, null]);
      await assert.rejects(db.query("update public.living_town_residents set subscriber_status='invalid' where town_id=$1", [saved.world.id]), (e: unknown) => (e as { code: string }).code === "22P02");
      await assert.rejects(db.query("update public.living_town_residents set subscription_tier='invalid' where town_id=$1", [saved.world.id]), (e: unknown) => (e as { code: string }).code === "23514");
      await service.applyVerifiedEvent({ source: "twitch_verified", event: { id: "renew", type: "NEW_SUBSCRIBER", townId: saved.world.id, occurredAt: at + 3, user,
        subscription: { active: true, tier: "2000", isGift: false, verifiedAt: at + 3, source: "eventsub" } } });
      assert.equal((await service.ownHouse({ ...viewer, twitchUserId: user.twitchUserId }, saved.world.id))?.id, home.id);
      assert.deepEqual(await service.mine(viewer), other);
    });

    await t.test("accidental full-file rerun fails atomically and leaves data and RPC writes intact", async () => {
      const beforeRetry = await snapshot(true);
      try { await assert.rejects(db.exec(migration2), (e: unknown) => (e as { code: string }).code === "42704"); }
      finally { await db.exec("rollback"); }
      assert.deepEqual(await snapshot(true), beforeRetry);
      const current = (await service.mine(owner))!;
      const result = await service.saveMayor(owner, current.world.id, current.revision, { name: "Still writable" });
      assert.equal(result.world.mayor.name, "Still writable");
    });
  } finally { await db.close(); }
});

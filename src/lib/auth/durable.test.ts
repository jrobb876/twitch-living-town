import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { DurableAuthStore } from "./durable-store";
import { AuthService } from "./service";
import { parseAuthConfig, authStorageMode, cookieNames } from "./config";
import { NextRequest } from "next/server";
import { createAuthHandlers } from "./http";
import { logoutAccount } from "./logout-client";
import { FakeTwitch, testEnv } from "./test-fixtures";
import { AuthError, CHAT_SCOPE, SESSION_TTL_MS } from "./types";
import { TokenVault } from "./crypto";
import type { RpcClient } from "../persistence/repository";
import { ChatManager } from "../chat/manager";
import { sockets, settle, welcome } from "../chat/test-fixtures";

const db = new PGlite();
before(async () => { await db.exec("create role anon; create role authenticated; create role service_role;"); await db.exec(await readFile("supabase/migrations/202610290006_durable_auth.sql", "utf8")); });
beforeEach(async () => { await db.exec("delete from public.living_town_auth_runtime"); });
after(async () => db.close());
const rpc: RpcClient = async (name, args) => {
  const keys = Object.keys(args);
  try {
    const result = await db.query<{ value: unknown }>(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")}) value`,
      keys.map((key) => typeof args[key] === "object" && args[key] !== null ? JSON.stringify(args[key]) : args[key]));
    return { data: result.rows[0]?.value, error: null };
  } catch (e) { return { data: null, error: { code: (e as { code: string }).code } }; }
};
const error = (code: string) => (e: unknown) => e instanceof AuthError && e.code === code;
function instance(twitch = new FakeTwitch(), client = rpc, production = false) {
  let now = Date.now();
  const store = new DurableAuthStore(client, () => now), config = parseAuthConfig({ ...testEnv, NODE_ENV: production ? "production" : "test" });
  const auth = new AuthService(config, twitch, store, () => now);
  const login = async (previous?: string) => {
    const attempt = auth.beginLogin();
    return auth.finishLogin({ state: new URL(attempt.location).searchParams.get("state")!, code: "synthetic-code" }, attempt.binding, previous);
  };
  return { auth, store, twitch, login, advance: (n: number) => { now += n; } };
}
test("durable sessions survive restart with startup validation, encryption and unchanged browser identity", async () => {
  const a = instance(); const signedIn = await a.login();
  const snapshot = (await db.query<{ sessions: unknown }>("select sessions from public.living_town_auth_runtime")).rows[0].sessions;
  for (const value of [signedIn.id, "test-access", "test-refresh", testEnv.SESSION_SECRET]) assert.ok(!JSON.stringify(snapshot).includes(value));
  const b = instance(); assert.deepEqual(await b.auth.getProfile(signedIn.id), a.twitch.identity);
  assert.equal(b.twitch.validations.length, 1); assert.equal(b.auth.csrfToken(signedIn.id), a.auth.csrfToken(signedIn.id));
  await assert.rejects(a.auth.getProfile(signedIn.id), error("unavailable"));
  await assert.rejects(a.store.flush(), error("unavailable"), "fenced process cannot overwrite a newer process's state");
  assert.deepEqual(await b.auth.getProfile(signedIn.id), a.twitch.identity);
});
test("sign-out and pending revocation survive restart; expired sessions cannot be revived", async () => {
  const a = instance(), login = await a.login();
  a.twitch.revoke = async () => { throw new AuthError("unavailable"); };
  await a.auth.signOut(login.id, a.auth.csrfToken(login.id));
  const b = instance(); assert.equal(await b.auth.getProfile(login.id), null);
  await b.auth.maintain(); assert.ok(b.twitch.revocations.includes("test-access"));
  const login2 = await b.login(); b.advance(SESSION_TTL_MS + 1);
  assert.equal(await b.auth.getProfile(login2.id), null);
  const c = instance(); assert.equal(await c.auth.getProfile(login2.id), null);
});
test("refreshed credentials are persisted and failed verification stays unavailable without discarding them", async () => {
  const a = instance(); a.twitch.validation.expiresIn = 1;
  const login = await a.login(); a.advance(2000);
  a.twitch.validate = async (token) => { if (token === "test-access") throw new AuthError("invalid_token"); throw new AuthError("unavailable"); };
  await assert.rejects(a.auth.getProfile(login.id), error("unavailable"));
  const b = instance(); assert.ok(await b.auth.getProfile(login.id));
  assert.deepEqual(b.twitch.validations, ["rotated-access"]);
  const entry = [...b.store.sessions].find(([key, s]) => new TokenVault(testEnv.SESSION_SECRET).open(s.encryptedTokens, key).accessToken === "rotated-access");
  assert.ok(entry); assert.equal(new TokenVault(testEnv.SESSION_SECRET).open(entry[1].encryptedTokens, entry[0]).refreshToken, "rotated-refresh");
});
test("unavailable durable storage denies identity and cannot report a successful logout", async () => {
  let outage = false;
  const a = instance(new FakeTwitch(), async (name, args) => { if (outage) throw new Error("private database detail"); return rpc(name, args); });
  const login = await a.login(); outage = true;
  await assert.rejects(a.auth.getProfile(login.id), error("unavailable"));
  await assert.rejects(a.auth.signOut(login.id, a.auth.csrfToken(login.id)), error("unavailable"));
  outage = false; await a.auth.signOut(login.id, a.auth.csrfToken(login.id));
  const b = instance(); assert.equal(await b.auth.getProfile(login.id), null);
});

test("expiry during refreshed-token validation durably removes the session and retains rotated-token cleanup", async () => {
  const a = instance(); a.twitch.validation.expiresIn = 1;
  const login = await a.login(); a.advance(2000);
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  a.twitch.validate = async (token) => {
    if (token === "test-access") throw new AuthError("invalid_token");
    started.resolve(); await release.promise; return { ...a.twitch.validation };
  };
  const pending = a.auth.getProfile(login.id);
  await started.promise; a.advance(SESSION_TTL_MS); release.resolve();
  assert.equal(await pending, null);
  const b = instance(); await b.store.ready();
  assert.equal(await b.auth.getProfile(login.id), null);
  assert.ok([...b.store.revocations.values()].some((entry) => new TokenVault(testEnv.SESSION_SECRET).open(entry.encryptedTokens, entry.key).accessToken === "rotated-access"));
  await b.auth.maintain(); assert.ok(b.twitch.revocations.includes("rotated-access"));
});
test("restored scope grants reconnect only their authorized channel, with one socket across repeated controls", { timeout: 5000 }, async () => {
  const a = instance(); a.twitch.validation.scopes = [CHAT_SCOPE]; const login = await a.login();
  const twitch = new FakeTwitch(); twitch.validation.scopes = [CHAT_SCOPE]; const b = instance(twitch), socket = sockets();
  const channelIds: string[] = [];
  const opened = Promise.withResolvers<void>();
  const manager = new ChatManager(b.auth, (url, handlers) => { const result = socket.factory(url, handlers); opened.resolve(); return result; }, Date.now, async (_token, id) => { channelIds.push(id); return "sub-1"; });
  try {
    assert.equal(socket.opened.length, 0, "restart never fabricates subscription readiness");
    await manager.start(login.id); await opened.promise; socket.opened[0].receive(welcome()); await settle();
    await manager.start(login.id); await settle();
    assert.equal(socket.opened.length, 1); assert.deepEqual(channelIds, ["12345"]);
    assert.ok(manager.overlayActivity("12345").ready);
  } finally { manager.dispose(); }
});
test("durable auth RPCs are inaccessible to browser roles and direct service-role table access is denied", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    const row = (await db.query<{ table_access: boolean; claim: boolean; save: boolean }>(`select has_table_privilege($1,'public.living_town_auth_runtime','SELECT,INSERT,UPDATE,DELETE') table_access,
      has_function_privilege($1,'public.living_town_auth_claim(uuid)','EXECUTE') claim,
      has_function_privilege($1,'public.living_town_auth_save(uuid,jsonb,jsonb)','EXECUTE') save`, [role])).rows[0];
    assert.equal(row.table_access, false); assert.equal(row.claim, role === "service_role"); assert.equal(row.save, role === "service_role");
  }
  await db.exec("set role service_role");
  try { const a = instance(); await a.login(); } finally { await db.exec("reset role"); }
  const before = (await db.query("select * from public.living_town_auth_runtime")).rows;
  await assert.rejects(db.exec(await readFile("supabase/migrations/202610290006_durable_auth.sql", "utf8"))); await db.exec("rollback");
  assert.deepEqual((await db.query("select * from public.living_town_auth_runtime")).rows, before);
});
test("public production requires HTTPS and durable auth while local production remains supported", () => {
  const local = parseAuthConfig({ ...testEnv, NODE_ENV: "production" }); assert.equal(authStorageMode(local), "memory");
  assert.throws(() => parseAuthConfig({ ...testEnv, NODE_ENV: "production", PUBLIC_DEPLOYMENT: "true" }), error("configuration"));
  const hosted = parseAuthConfig({ ...testEnv, NODE_ENV: "production", PUBLIC_DEPLOYMENT: "true", TWITCH_REDIRECT_URI: "https://town.example/api/auth/twitch/callback" });
  assert.equal(authStorageMode(hosted), "supabase"); assert.throws(() => authStorageMode(hosted, "memory"), error("configuration"));
});

test("delayed ownership success cannot reactivate a process after a newer claim fences it", async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let delay = false, held = false;
  const a = instance(new FakeTwitch(), async (name, args) => {
    const result = await rpc(name, args);
    if (name === "living_town_auth_check" && delay && !held) {
      held = true; entered.resolve(); await release.promise;
    }
    return result;
  });
  const login = await a.login(); delay = true;
  const pending = assert.rejects(a.auth.getProfile(login.id), error("unavailable"));
  await entered.promise;
  const b = instance(); assert.ok(await b.auth.getProfile(login.id));
  await assert.rejects(a.store.ready(), error("unavailable"));
  release.resolve(); await pending;
  assert.equal(a.store.available(), false);
  await assert.rejects(a.store.flush(), error("unavailable"));
  assert.ok(await b.auth.getProfile(login.id));
});

test("missing save acknowledgements fail login and logout; a failed deletion retries before access", async () => {
  for (const acknowledgement of [null, false]) {
    let failSave = true;
    const a = instance(new FakeTwitch(), async (name, args) => name === "living_town_auth_save" && failSave
      ? { data: acknowledgement, error: null } : rpc(name, args));
    await assert.rejects(a.login(), error("unavailable"));
    assert.equal(a.store.sessions.size, 0); assert.equal(a.store.available(), false);
    failSave = false; const login = await a.login(); failSave = true;
    await assert.rejects(a.auth.signOut(login.id, a.auth.csrfToken(login.id)), error("unavailable"));
    await assert.rejects(a.auth.getProfile(login.id), error("unavailable"));
    failSave = false; assert.equal(await a.auth.getProfile(login.id), null);
    const b = instance(); assert.equal(await b.auth.getProfile(login.id), null);
  }
});

test("a lost save response never reports logout success even when the deletion committed", async () => {
  let loseResponse = false;
  const a = instance(new FakeTwitch(), async (name, args) => {
    const result = await rpc(name, args);
    if (name === "living_town_auth_save" && loseResponse) throw new Error("synthetic lost response");
    return result;
  });
  const login = await a.login(); loseResponse = true;
  await assert.rejects(a.auth.signOut(login.id, a.auth.csrfToken(login.id)), error("unavailable"));
  const b = instance(); assert.equal(await b.auth.getProfile(login.id), null);
  await b.auth.maintain(); assert.ok(b.twitch.revocations.includes("test-access"));
});

test("maintenance that loses ownership during validation cannot revoke the replacement's credentials", async () => {
  const a = instance(), login = await a.login();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  a.twitch.validate = async () => { entered.resolve(); await release.promise; throw new AuthError("invalid_token"); };
  const pending = assert.rejects(a.auth.maintain(true), error("unavailable"));
  await entered.promise;
  const b = instance(); assert.ok(await b.auth.getProfile(login.id));
  release.resolve(); await pending;
  assert.deepEqual(a.twitch.revocations, []);
  assert.ok(await b.auth.getProfile(login.id));
});

test("production fetch logout recognizes a restored cookie, clears it and remains revoked after another restart", async () => {
  const a = instance(new FakeTwitch(), rpc, true), login = await a.login();
  let databaseCalls = 0;
  const b = instance(new FakeTwitch(), async (name, args) => { databaseCalls++; return rpc(name, args); }, true);
  assert.ok(await b.auth.getProfile(login.id));
  const handlers = createAuthHandlers(() => b.auth, true), names = cookieNames(true);
  const headers = { Origin: "null", "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "navigate",
    "Content-Type": "application/x-www-form-urlencoded", Cookie: `${names.session}=${login.id}` };
  const callsBefore = databaseCalls;
  const rejected = await handlers.logout(new NextRequest(`${b.auth.config.origin}/api/auth/logout`, {
    method: "POST", headers, body: new URLSearchParams({ csrfToken: b.auth.csrfToken(login.id) }),
  }));
  assert.equal(rejected.status, 403); assert.deepEqual(await rejected.json(), { error: "forbidden" });
  assert.equal(databaseCalls, callsBefore, "Origin rejection happens before persistence or session lookup");
  assert.equal(rejected.headers.get("set-cookie"), null); assert.deepEqual(b.twitch.revocations, []);
  assert.ok(await b.auth.getProfile(login.id));
  await logoutAccount(b.auth.csrfToken(login.id), async (url, init) => {
    assert.equal(url, "/api/auth/logout"); assert.equal(init?.method, "POST");
    assert.equal(init?.mode, "cors"); assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.redirect, "error"); assert.equal(init?.referrerPolicy, "no-referrer");
    const requestHeaders = new Headers(init.headers);
    assert.equal(requestHeaders.has("origin"), false, "browser, not JavaScript, supplies Origin");
    requestHeaders.set("Origin", b.auth.config.origin); requestHeaders.set("Sec-Fetch-Site", "same-origin");
    requestHeaders.set("Cookie", `${names.session}=${login.id}`);
    const response = await handlers.logout(new NextRequest(`${b.auth.config.origin}${url}`, { ...init, headers: requestHeaders, signal: init.signal ?? undefined }));
    assert.equal(response.status, 200);
    for (const name of [names.session, names.state]) {
      const cookie = response.cookies.get(name)!;
      assert.equal(cookie.maxAge, 0); assert.equal(cookie.value, ""); assert.equal(cookie.secure, true);
      assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, "lax"); assert.equal(cookie.path, "/");
    }
    return response;
  });
  assert.deepEqual(b.twitch.revocations, ["test-access"]);
  const c = instance(new FakeTwitch(), rpc, true);
  assert.equal(await c.auth.getProfile(login.id), null);
  const session = await createAuthHandlers(() => c.auth, true).session(new NextRequest(`${c.auth.config.origin}/api/auth/session`, {
    headers: { Cookie: `${names.session}=${login.id}` },
  }));
  assert.equal((await session.json()).user, null);
});

test("logout client does not report success for denied or unacknowledged responses", async () => {
  for (const response of [Response.json({ error: "forbidden" }, { status: 403 }), Response.json({ signedOut: false })]) {
    await assert.rejects(logoutAccount("synthetic-csrf", async () => response), /Sign-out failed/);
  }
  await assert.rejects(logoutAccount("synthetic-csrf", async () => { throw new TypeError("synthetic offline"); }));
});

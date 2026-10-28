import assert from "node:assert/strict";
import test from "node:test";
import { assertTownOwner } from "./authorization";
import { parseAuthConfig } from "./config";
import { randomToken, TokenVault } from "./crypto";
import { fixture, testEnv } from "./test-fixtures";
import { AuthError, SESSION_TTL_MS, STATE_TTL_MS, VALIDATION_INTERVAL_MS } from "./types";
import { createWorld } from "../simulation/world";
import { InMemoryTownRepository } from "../simulation/repository";

const error = (code: string) => (value: unknown) => value instanceof AuthError && value.code === code;

test("configuration rejects missing/weak secrets and unsafe production callbacks", () => {
  assert.throws(() => parseAuthConfig({}), error("configuration"));
  assert.throws(() => parseAuthConfig({ ...testEnv, SESSION_SECRET: "placeholder" }), error("configuration"));
  assert.throws(() => parseAuthConfig({ ...testEnv, NODE_ENV: "production" }), error("configuration"));
  for (const uri of ["http://other.example/api/auth/twitch/callback", `${testEnv.TWITCH_REDIRECT_URI}?next=evil`, "https://user:pass@example.com/api/auth/twitch/callback"]) {
    assert.throws(() => parseAuthConfig({ ...testEnv, TWITCH_REDIRECT_URI: uri }), error("configuration"));
  }
  assert.equal(parseAuthConfig(testEnv).origin, "http://localhost:3000");
  assert.equal(fixture(true).config.production, true);
});

test("hex and base64 session secrets normalize to the same 32-byte encryption key", () => {
  const key = Buffer.from(Array.from({ length: 32 }, (_, index) => index * 7));
  const base64 = key.toString("base64");
  for (const encoding of [base64, key.toString("hex"), key.toString("hex").toUpperCase()]) {
    const config = parseAuthConfig({ ...testEnv, SESSION_SECRET: ` ${encoding} ` });
    assert.equal(config.sessionSecret, base64);
    const tokens = { accessToken: "synthetic-access", refreshToken: "synthetic-refresh" };
    const sealed = new TokenVault(config.sessionSecret).seal(tokens, "record");
    assert.deepEqual(new TokenVault(base64).open(sealed, "record"), tokens);
  }
  for (const invalid of ["a".repeat(63), "a".repeat(65), "g".repeat(64), "a".repeat(32)]) {
    assert.throws(() => parseAuthConfig({ ...testEnv, SESSION_SECRET: invalid }), error("configuration"));
  }
});

test("authorization requests are random, browser-bound, minimal-scope and contain no secret", () => {
  const f = fixture(), a = f.begin(), b = f.begin(), url = new URL(a.location);
  assert.match(a.state, /^[\w-]{43}$/);
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.state, a.binding);
  assert.equal(url.origin, "https://id.twitch.tv");
  assert.equal(url.searchParams.get("scope"), "");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), testEnv.TWITCH_REDIRECT_URI);
  assert.equal(url.searchParams.get("force_verify"), "true");
  assert.ok(!a.location.includes(testEnv.TWITCH_CLIENT_SECRET));
  assert.ok(!JSON.stringify([...f.store.states]).includes(a.state));
  assert.ok(!JSON.stringify([...f.store.states]).includes(a.binding));
});

for (const invalid of ["missing", "malformed", "expired", "mismatch", "missing binding"] as const) {
  test(`OAuth state rejects ${invalid} before any exchange`, async () => {
    const f = fixture(), a = f.begin();
    if (invalid === "expired") f.advance(STATE_TTL_MS);
    await assert.rejects(f.service.finishLogin({
      state: invalid === "missing" ? undefined : invalid === "malformed" ? "bad" : a.state, code: "code",
    }, invalid === "mismatch" ? randomToken() : invalid === "missing binding" ? undefined : a.binding), error("state"));
    assert.equal(f.twitch.exchanges.length, 0);
    if (["expired", "mismatch", "missing binding"].includes(invalid)) {
      await assert.rejects(f.service.finishLogin({ state: a.state, code: "code" }, a.binding), error("state"));
    }
  });
}

test("state is consumed atomically before concurrent callbacks exchange a code", async () => {
  const f = fixture(), a = f.begin();
  const results = await Promise.allSettled([
    f.service.finishLogin({ state: a.state, code: "code" }, a.binding),
    f.service.finishLogin({ state: a.state, code: "code" }, a.binding),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.twitch.exchanges.length, 1);
});

test("denied authorization and missing codes consume state without creating sessions", async () => {
  for (const code of ["denied", "code"]) {
    const f = fixture(), a = f.begin();
    const input = { state: a.state, ...(code === "denied" ? { error: "access_denied" } : {}) };
    await assert.rejects(f.service.finishLogin(input, a.binding), error(code));
    await assert.rejects(f.service.finishLogin({ state: a.state, code: "code" }, a.binding), error("state"));
    assert.equal(f.store.sessions.size, 0);
  }
});

test("starting a replacement login cancels the old browser attempt", async () => {
  const f = fixture(), a = f.begin();
  f.service.beginLogin(a.binding);
  await assert.rejects(f.service.finishLogin({ state: a.state, code: "code" }, a.binding), error("state"));
});

test("exchange/network failures are sanitized and the code cannot be retried", async () => {
  const f = fixture(), a = f.begin();
  f.twitch.exchange = async () => { throw new Error("upstream private detail"); };
  await assert.rejects(f.service.finishLogin({ state: a.state, code: "code" }, a.binding), error("unavailable"));
  await assert.rejects(f.service.finishLogin({ state: a.state, code: "code" }, a.binding), error("state"));
  assert.equal(f.store.sessions.size, 0);
});

test("login validates both client and stable Twitch user identity before issuing a session", async () => {
  for (const mismatch of ["client", "user", "non-user-token"]) {
    const f = fixture();
    if (mismatch === "client") f.twitch.validation.clientId = "other-client";
    if (mismatch === "user") f.twitch.identity.twitchUserId = "999";
    if (mismatch === "non-user-token") f.twitch.validation.userId = "";
    await assert.rejects(f.login(), error("invalid_token"));
    assert.equal(f.store.sessions.size, 0);
    await f.service.maintain();
    assert.deepEqual(f.twitch.revocations, ["test-access"]);
  }
});

test("tokens are authenticated-encrypted, bound to their record and never stored as session IDs", async () => {
  const f = fixture(), signedIn = await f.login(), vault = new TokenVault(testEnv.SESSION_SECRET);
  const [[key, session]] = [...f.store.sessions];
  assert.notEqual(key, signedIn.id);
  assert.ok(!JSON.stringify([...f.store.sessions]).includes("test-access"));
  assert.ok(!JSON.stringify([...f.store.sessions]).includes("test-refresh"));
  assert.deepEqual(vault.open(session.encryptedTokens, key), f.twitch.tokens);
  assert.throws(() => vault.open(session.encryptedTokens, "wrong-record"));
  assert.throws(() => new TokenVault(Buffer.alloc(32, 8).toString("base64")).open(session.encryptedTokens, key));
  const [iv, tag, payload] = session.encryptedTokens.split(".");
  const bytes = Buffer.from(payload, "base64url"); bytes[0] ^= 1;
  assert.throws(() => vault.open(`${iv}.${tag}.${bytes.toString("base64url")}`, key));
  session.encryptedTokens = `${iv}.${tag}.${bytes.toString("base64url")}`;
  await assert.rejects(f.service.getProfile(signedIn.id, true), error("invalid_token"));
  assert.equal(f.store.sessions.size, 0);
});

test("signed-out, forged and expired sessions grant no identity; expiry never slides", async () => {
  const f = fixture(), signedIn = await f.login();
  assert.equal(await f.service.getProfile(), null);
  assert.equal(await f.service.getProfile("forged-user-id"), null);
  assert.equal(await f.service.getProfile(randomToken()), null);
  assert.deepEqual(await f.service.getProfile(signedIn.id), f.twitch.identity);
  f.advance(SESSION_TTL_MS - 1);
  assert.ok(await f.service.getProfile(signedIn.id));
  f.advance(1);
  assert.equal(await f.service.getProfile(signedIn.id), null);
  await f.service.maintain();
  assert.ok(f.twitch.revocations.includes("test-access"));
});

test("login rotates existing browser sessions without revoking a reused Twitch token", async () => {
  const f = fixture(), first = await f.login(), second = await f.login(first.id);
  assert.notEqual(first.id, second.id);
  assert.equal(await f.service.getProfile(first.id), null);
  assert.ok(await f.service.getProfile(second.id));
  await f.service.maintain();
  assert.deepEqual(f.twitch.revocations, []);
  f.twitch.tokens = { accessToken: "new-access", refreshToken: "new-refresh" };
  await f.login(second.id);
  await f.service.maintain();
  assert.deepEqual(f.twitch.revocations, ["test-access"]);
});

test("startup, periodic idle maintenance and stale session reads validate tokens", async () => {
  const f = fixture(), signedIn = await f.login();
  assert.equal(f.twitch.validations.length, 1);
  await f.service.getProfile(signedIn.id);
  assert.equal(f.twitch.validations.length, 1);
  await f.service.maintain(true);
  assert.equal(f.twitch.validations.length, 2);
  f.advance(VALIDATION_INTERVAL_MS);
  await f.service.maintain(); // No browser requests needed.
  assert.equal(f.twitch.validations.length, 3);
  f.advance(VALIDATION_INTERVAL_MS);
  await f.service.getProfile(signedIn.id);
  assert.equal(f.twitch.validations.length, 4);
});

test("expired token refresh is reactive, single-flight and stores the rotated refresh token", async () => {
  const f = fixture(); f.twitch.validation.expiresIn = 1;
  const signedIn = await f.login(); f.advance(1000);
  f.twitch.validate = async (token) => {
    f.twitch.validations.push(token);
    if (token === "test-access") throw new AuthError("invalid_token");
    return { ...f.twitch.validation, expiresIn: 7200 };
  };
  const profiles = await Promise.all([f.service.getProfile(signedIn.id), f.service.getProfile(signedIn.id)]);
  assert.ok(profiles.every(Boolean));
  assert.deepEqual(f.twitch.refreshes, ["test-refresh"]);
  const [[key, session]] = [...f.store.sessions];
  assert.deepEqual(new TokenVault(testEnv.SESSION_SECRET).open(session.encryptedTokens, key), { accessToken: "rotated-access", refreshToken: "rotated-refresh" });
  await f.service.signOut(signedIn.id, f.service.csrfToken(signedIn.id));
  assert.ok(f.twitch.revocations.includes("rotated-access"));
});

test("revoked unexpired tokens terminate every session sharing the token without refresh", async () => {
  const f = fixture(), a = await f.login(), b = await f.login();
  f.twitch.validate = async () => { throw new AuthError("invalid_token"); };
  await assert.rejects(f.service.getProfile(a.id, true), error("invalid_token"));
  assert.equal(await f.service.getProfile(b.id), null);
  assert.equal(f.twitch.refreshes.length, 0);
});

test("validation outages, refresh failure and refreshed identity mismatch fail closed", async () => {
  for (const failure of ["outage", "refresh", "identity"]) {
    const f = fixture(); f.twitch.validation.expiresIn = 1;
    const a = await f.login(); f.advance(1000);
    f.twitch.validate = async (token) => {
      if (failure === "outage") throw new AuthError("unavailable");
      if (token === "test-access") throw new AuthError("invalid_token");
      return { ...f.twitch.validation, userId: "999" };
    };
    if (failure === "refresh") f.twitch.refresh = async () => { throw new AuthError("invalid_token"); };
    await assert.rejects(f.service.getProfile(a.id), error(failure === "outage" ? "unavailable" : "invalid_token"));
    assert.equal(await f.service.getProfile(a.id), null);
    if (failure === "outage") assert.equal(f.twitch.refreshes.length, 0);
  }
});

test("logout verifies CSRF, invalidates locally on revocation failure and retries later", async () => {
  const f = fixture(), a = await f.login();
  await assert.rejects(f.service.signOut(a.id, "forged"), error("forbidden"));
  assert.ok(await f.service.getProfile(a.id));
  f.twitch.revoke = async () => { throw new AuthError("unavailable"); };
  await f.service.signOut(a.id, f.service.csrfToken(a.id));
  assert.equal(await f.service.getProfile(a.id), null);
  assert.equal(f.store.revocations.size, 1);
  f.twitch.revoke = async (token) => { f.twitch.revocations.push(token); };
  await f.service.maintain();
  assert.equal(f.store.revocations.size, 0);
  assert.deepEqual(f.twitch.revocations, ["test-access"]);
});

test("validation completing after sign-out cannot recreate the session", async () => {
  const f = fixture(), a = await f.login();
  let release!: () => void;
  f.twitch.validate = () => new Promise((resolve) => { release = () => resolve(f.twitch.validation); });
  const pending = f.service.getProfile(a.id, true);
  await f.service.signOut(a.id, f.service.csrfToken(a.id));
  release();
  assert.equal(await pending, null);
  assert.equal(f.store.sessions.size, 0);
});

test("town authorization uses repository ownership, never login/name/subscriber assumptions", () => {
  const repo = new InMemoryTownRepository(), f = fixture();
  repo.save(createWorld({ id: "a", streamerTwitchUserId: "12345", seed: 42, name: "A", mayorName: "Mochi" }));
  repo.save(createWorld({ id: "b", streamerTwitchUserId: "999", seed: 43, name: "B", mayorName: "Mochi" }));
  assert.throws(() => assertTownOwner(null, "a", repo), error("unauthorized"));
  assert.throws(() => assertTownOwner(f.twitch.identity, "b", repo), error("forbidden"));
  assert.throws(() => assertTownOwner(f.twitch.identity, "missing", repo), error("forbidden"));
  assert.throws(() => assertTownOwner({ ...f.twitch.identity, twitchUserId: "999" }, "a", repo), error("forbidden"));
  assert.equal(assertTownOwner({ ...f.twitch.identity, displayName: "Renamed" }, "a", repo).twitchUserId, "12345");
  assert.equal("subscriber" in f.twitch.identity, false);
  assert.equal("role" in f.twitch.identity, false);
});

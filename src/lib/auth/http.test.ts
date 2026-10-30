import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { cookieNames } from "./config";
import { createAuthHandlers } from "./http";
import { fixture } from "./test-fixtures";
import { AuthError, STATE_TTL_MS } from "./types";

function setup(production = false, redirectUri?: string) {
  const f = fixture(production, redirectUri), handlers = createAuthHandlers(() => f.service, production), names = cookieNames(production);
  const request = (path: string, cookies: Record<string, string> = {}, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Cookie", Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join("; "));
    return new NextRequest(`${f.config.origin}${path}`, { ...init, headers, signal: init.signal ?? undefined });
  };
  return { ...f, handlers, names, request };
}

for (const [production, redirectUri] of [[false, undefined], [true, undefined], [true, "http://localhost:3000/api/auth/twitch/callback"]] as const) {
  test(`login/callback set opaque HttpOnly SameSite cookies and no-store responses (${production ? "production" : "development"}, ${redirectUri ? "localhost" : "default"})`, async () => {
    const f = setup(production, redirectUri), login = f.handlers.login(f.request("/api/auth/twitch/login?returnTo=https://evil.example"));
    assert.equal(login.status, 303);
    const location = new URL(login.headers.get("location")!), cookie = login.cookies.get(f.names.state)!;
    assert.equal(location.origin, "https://id.twitch.tv");
    assert.equal(location.searchParams.get("returnTo"), null);
    assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.secure, production); assert.equal(cookie.path, "/"); assert.equal(cookie.domain, undefined);
    assert.equal(cookie.maxAge, STATE_TTL_MS / 1000);
    if (production) assert.match(cookie.name, /^__Host-/);
    const response = await f.handlers.callback(f.request(`/api/auth/twitch/callback?code=private-code&state=${location.searchParams.get("state")}`, { [f.names.state]: cookie.value }));
    assert.equal(response.headers.get("location"), "/account");
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.cookies.get(f.names.state)?.maxAge, 0);
    const session = response.cookies.get(f.names.session)!;
    assert.match(session.value, /^[\w-]{43}$/);
    assert.equal(session.httpOnly, true); assert.equal(session.secure, production);
    assert.equal(session.sameSite, "lax"); assert.equal(session.maxAge, 28800);
    const headers = JSON.stringify([...response.headers]);
    for (const secret of ["test-access", "test-refresh", "test-client-secret", "private-code"]) assert.ok(!headers.includes(secret));
    const publicSession = await f.handlers.session(f.request("/api/auth/session", { [f.names.session]: session.value }));
    assert.deepEqual(await publicSession.json(), { user: f.twitch.identity, csrfToken: f.service.csrfToken(session.value), configured: true });
    assert.match(publicSession.headers.get("cache-control")!, /private.*no-store/);
    assert.equal(publicSession.headers.get("vary"), "Cookie");
  });
}

test("callback rejects missing state, repeated parameters and replay without leaking upstream errors", async () => {
  const f = setup(), a = f.begin();
  for (const query of ["code=code", `state=${a.state}&state=${a.state}&code=code`, `state=${a.state}&code=code`]) {
    const response = await f.handlers.callback(f.request(`/api/auth/twitch/callback?${query}&error_description=private-upstream-detail`, { [f.names.state]: a.binding }));
    assert.equal(response.headers.get("location"), "/account?auth=state");
    assert.equal(response.cookies.get(f.names.state)?.maxAge, 0);
  }
  assert.equal(f.twitch.exchanges.length, 0);
  assert.equal(f.store.states.size, 0);
});

test("denied OAuth and token exchange failure produce safe retry messages and no session", async () => {
  const f = setup(), a = f.begin();
  const denied = await f.handlers.callback(f.request(`/api/auth/twitch/callback?state=${a.state}&error=access_denied&error_description=private`, { [f.names.state]: a.binding }));
  assert.equal(denied.headers.get("location"), "/account?auth=denied");
  assert.equal(denied.cookies.get(f.names.session), undefined);
  const b = f.begin();
  f.twitch.exchange = async () => { throw new AuthError("code"); };
  const failed = await f.handlers.callback(f.request(`/api/auth/twitch/callback?state=${b.state}&code=bad-code`, { [f.names.state]: b.binding }));
  assert.equal(failed.headers.get("location"), "/account?auth=code");
  assert.equal(f.store.sessions.size, 0);
});

test("login rejects a foreign origin and configuration failure leaves a safe signed-out endpoint", async () => {
  const f = setup();
  assert.equal(f.handlers.login(new NextRequest("https://evil.example/api/auth/twitch/login")).headers.get("location"), "/account?auth=forbidden");
  const unconfigured = createAuthHandlers(() => { throw new AuthError("configuration"); }, false);
  assert.equal(unconfigured.login(f.request("/api/auth/twitch/login")).headers.get("location"), "/account?auth=configuration");
  const response = await unconfigured.session(f.request("/api/auth/session"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { user: null, csrfToken: null, configured: false, error: "configuration" });
});

test("public session endpoint returns signed-out state and clears invalid or revoked cookies", async () => {
  const f = setup();
  assert.deepEqual(await (await f.handlers.session(f.request("/api/auth/session"))).json(), { user: null, csrfToken: null, configured: true });
  const forged = await f.handlers.session(f.request("/api/auth/session", { [f.names.session]: "forged" }));
  assert.equal(forged.cookies.get(f.names.session)?.maxAge, 0);
  const a = await f.login();
  f.advance(30 * 60 * 1000);
  f.twitch.validate = async () => { throw new AuthError("invalid_token"); };
  const revoked = await f.handlers.session(f.request("/api/auth/session", { [f.names.session]: a.id }));
  assert.equal(revoked.status, 401);
  assert.equal((await revoked.json()).user, null);
  assert.equal(revoked.cookies.get(f.names.session)?.maxAge, 0);
});

test("temporary verification outage denies identity without deleting the recoverable browser session", async () => {
  const f = setup(), login = await f.login(); f.advance(30 * 60 * 1000);
  f.twitch.validate = async () => { throw new AuthError("unavailable"); };
  const response = await f.handlers.session(f.request("/api/auth/session", { [f.names.session]: login.id }));
  assert.equal(response.status, 503); assert.equal(response.cookies.get(f.names.session), undefined);
  assert.equal((await response.json()).user, null);
});

test("logout requires same-origin POST form with session-bound CSRF before revocation", async () => {
  const f = setup(), a = await f.login(), csrf = f.service.csrfToken(a.id);
  const headers = { Origin: f.config.origin, "Content-Type": "application/x-www-form-urlencoded" };
  for (const init of [
    { headers: { ...headers, Origin: "https://evil.example" }, body: `csrfToken=${csrf}` },
    { headers: { ...headers, Origin: "null", "sec-fetch-site": "same-origin" }, body: `csrfToken=${csrf}` },
    { headers: { "Content-Type": headers["Content-Type"] }, body: `csrfToken=${csrf}` },
    { headers: { ...headers, Origin: `${f.config.origin}/forged` }, body: `csrfToken=${csrf}` },
    { headers: { ...headers, Origin: `${f.config.origin}, https://evil.example` }, body: `csrfToken=${csrf}` },
    { headers, body: "csrfToken=forged" },
    { headers: { ...headers, "sec-fetch-site": "cross-site" }, body: `csrfToken=${csrf}` },
    { headers: { ...headers, "Content-Type": "application/json" }, body: "{}" },
    { headers, body: `csrfToken=${"a".repeat(1100)}` },
  ]) {
    const denied = await f.handlers.logout(f.request("/api/auth/logout", { [f.names.session]: a.id }, { method: "POST", ...init }));
    assert.equal(denied.status, 403);
    assert.ok(await f.service.getProfile(a.id));
    assert.equal(f.twitch.revocations.length, 0);
  }
  const response = await f.handlers.logout(f.request("/api/auth/logout", { [f.names.session]: a.id }, { method: "POST", headers, body: `csrfToken=${csrf}` }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/account?auth=signed_out");
  assert.equal(response.cookies.get(f.names.session)?.maxAge, 0);
  assert.equal(await f.service.getProfile(a.id), null);
  assert.deepEqual(f.twitch.revocations, ["test-access"]);
});

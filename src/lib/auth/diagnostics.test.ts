import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { NextRequest } from "next/server";
import { AuthError, isAuthError } from "./types";
import { authErrorCategory, createAuthDiagnosticLogger, type AuthDiagnostic } from "./diagnostics";
import { createAuthHandlers } from "./http";
import { fixture, testEnv } from "./test-fixtures";
import { TwitchClient } from "./twitch";
import { AuthService } from "./service";
import { parseAuthConfig, cookieNames } from "./config";

function foreignError(code: string): unknown {
  return runInNewContext("new (class AuthError extends Error { constructor() { super('sensitive-marker'); this.name = 'AuthError'; this.code = code; } })()", { code });
}

test("AuthError recognition survives separate route/module instances and rejects arbitrary codes", () => {
  const error = foreignError("state");
  assert.equal(error instanceof AuthError, false);
  assert.equal(isAuthError(error), true);
  assert.equal(authErrorCategory(error), "state");
  for (const invalid of [null, new Error("state"), { name: "AuthError", code: "sensitive-marker" }, { name: "OtherError", code: "state" }]) assert.equal(isAuthError(invalid), false);
});

test("pre-callback and callback errors from cached service modules keep their original safe categories", async () => {
  const f = fixture();
  const beforeCallback = createAuthHandlers(() => { throw foreignError("configuration"); }, false);
  assert.equal(beforeCallback.login(new NextRequest("http://localhost:3000/api/auth/twitch/login")).headers.get("location"), "/account?auth=configuration");
  f.service.finishLogin = async () => { throw foreignError("state"); };
  const response = await createAuthHandlers(() => f.service, false).callback(new NextRequest("http://localhost:3000/api/auth/twitch/callback"));
  assert.equal(response.headers.get("location"), "/account?auth=state");
  f.twitch.exchange = async () => { throw foreignError("code"); };
  const other = fixture(); other.twitch.exchange = f.twitch.exchange;
  await assert.rejects(other.login(), (error: unknown) => isAuthError(error) && error.code === "code");
});

test("structured diagnostics redact exception messages, stacks, URLs, credentials and nested cause content", () => {
  const entries: AuthDiagnostic[] = [], log = createAuthDiagnosticLogger((entry) => entries.push(entry));
  const marker = "sensitive-marker";
  for (const [code, category] of [["ENOTFOUND", "dns"], ["UND_ERR_CONNECT_TIMEOUT", "timeout"], ["SELF_SIGNED_CERT_IN_CHAIN", "tls"], ["ECONNRESET", "connection"]]) {
    const error = Object.assign(new TypeError(`${marker} https://example.com/callback?code=${marker}`), {
      cause: { code, message: marker, token: marker, cookie: marker, url: marker }, secret: marker,
    });
    log("token_exchange", "failure", error);
    assert.equal(entries.at(-1)?.category, category);
  }
  log("profile", "failure", foreignError("invalid_token"));
  log("token_validation", "failure", new Error(marker), 503);
  log("login_state", "failure", { name: marker, code: marker, message: marker, stack: marker });
  assert.ok(!JSON.stringify(entries).includes(marker));
  assert.deepEqual(entries[0], { event: "twitch_auth", operation: "token_exchange", outcome: "failure", endpoint: "id.twitch.tv/oauth2/token", category: "dns" });
  assert.equal(entries[5].httpStatus, 503);
  assert.equal(entries[5].category, "http_error");
  assert.doesNotThrow(() => createAuthDiagnosticLogger(() => { throw new Error(marker); })("login_state", "failure", new Error(marker)));
});

test("real OAuth helper and callback compose correctly for basic and chat logins with separate scopes", async () => {
  for (const chat of [false, true]) {
    const config = parseAuthConfig(testEnv), scopes = chat ? ["user:read:chat"] : [], requests: { url: string; options: RequestInit }[] = [];
    const request: typeof fetch = async (url, options) => {
      requests.push({ url: String(url), options: options! });
      if (String(url).endsWith("/token")) return Response.json({ token_type: "bearer", access_token: "synthetic-access", refresh_token: "synthetic-refresh" });
      if (String(url).endsWith("/validate")) return Response.json({ client_id: config.clientId, user_id: "12345", expires_in: 3600, scopes });
      return Response.json({ data: [{ id: "12345", login: "neighbor", display_name: "Neighbor" }] });
    };
    const service = new AuthService(config, new TwitchClient(config, request));
    const login = service.beginLogin(undefined, chat ? "12345" : undefined);
    const location = new URL(login.location), state = location.searchParams.get("state")!;
    assert.equal(location.searchParams.get("scope"), scopes.join(" "));
    const response = await createAuthHandlers(() => service, false).callback(new NextRequest(`${config.redirectUri}?state=${state}&code=synthetic-code`, {
      headers: { Cookie: `${cookieNames(false).state}=${login.binding}` },
    }));
    assert.equal(response.headers.get("location"), chat ? "/?chat=authorized" : "/dashboard");
    const id = response.cookies.get(cookieNames(false).session)!.value;
    assert.equal((await service.chatSession(id)).authorized, chat);
    assert.equal(new URLSearchParams(String(requests[0].options.body)).get("redirect_uri"), location.searchParams.get("redirect_uri"));
  }
});

test("response-body network failures identify the endpoint/category without leaking exceptions", async (t) => {
  const lines: string[] = [];
  t.mock.method(console, "info", (line: string) => lines.push(line));
  const response = new Response(new ReadableStream({ start(controller) {
    controller.error(Object.assign(new Error("sensitive-marker"), { name: "TimeoutError" }));
  } }));
  const client = new TwitchClient(parseAuthConfig(testEnv), async () => response);
  await assert.rejects(client.validate("synthetic-access"), (error: unknown) => isAuthError(error) && error.code === "unavailable");
  const last = JSON.parse(lines.at(-1)!);
  assert.equal(last.endpoint, "id.twitch.tv/oauth2/validate");
  assert.equal(last.category, "timeout");
  assert.ok(!lines.join("").includes("sensitive-marker"));
  assert.ok(!lines.join("").includes("synthetic-access"));
});

test("scope-free validation with null, omitted or empty scopes permits basic login but never chat authorization", async () => {
  for (const scopes of [null, undefined, []]) {
    for (const chat of [false, true]) {
      const config = parseAuthConfig(testEnv);
      const request: typeof fetch = async (url) => {
        if (String(url).endsWith("/token")) return Response.json({ token_type: "bearer", access_token: "synthetic-access", refresh_token: "synthetic-refresh" });
        if (String(url).endsWith("/validate")) return Response.json({ client_id: config.clientId, user_id: "12345", expires_in: 3600, scopes });
        return Response.json({ data: [{ id: "12345", login: "neighbor", display_name: "Neighbor" }] });
      };
      const service = new AuthService(config, new TwitchClient(config, request));
      const attempt = service.beginLogin(undefined, chat ? "12345" : undefined);
      const state = new URL(attempt.location).searchParams.get("state")!;
      const response = await createAuthHandlers(() => service, false).callback(new NextRequest(`${config.redirectUri}?state=${state}&code=synthetic-code`, {
        headers: { Cookie: `${cookieNames(false).state}=${attempt.binding}` },
      }));
      assert.equal(response.headers.get("location"), chat ? "/account?auth=chat_scope" : "/dashboard");
      const cookie = response.cookies.get(cookieNames(false).session);
      if (chat) assert.equal(cookie, undefined);
      else {
        assert.ok(cookie);
        assert.equal((await service.getProfile(cookie.value))?.twitchUserId, "12345");
        assert.equal((await service.chatSession(cookie.value)).authorized, false);
        const grant = await service.chatSession(cookie.value);
        await assert.rejects(service.chatCredentials(grant.key), (error: unknown) => isAuthError(error) && error.code === "chat_scope");
      }
    }
  }
});

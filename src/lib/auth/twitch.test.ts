import assert from "node:assert/strict";
import test from "node:test";
import { parseAuthConfig } from "./config";
import { testEnv } from "./test-fixtures";
import { TwitchClient } from "./twitch";
import { AuthError } from "./types";

function client(responses: (Response | Error)[]) {
  const calls: { url: string; options: RequestInit }[] = [];
  const fakeFetch: typeof fetch = async (url, options) => {
    calls.push({ url: String(url), options: options! });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    if (response instanceof Error) throw response;
    return response;
  };
  return { api: new TwitchClient(parseAuthConfig(testEnv), fakeFetch), calls };
}
const tokens = () => Response.json({ access_token: "test-access", refresh_token: "test-refresh", token_type: "bearer" });
const error = (code: string) => (value: unknown) => value instanceof AuthError && value.code === code;

test("Twitch exchanges and refreshes tokens only in encoded server-side POST bodies", async () => {
  const f = client([tokens(), tokens(), new Response(null, { status: 200 })]);
  await f.api.exchange("code+with&special=characters");
  await f.api.refresh("refresh+with&special=characters");
  await f.api.revoke("test-access");
  for (const call of f.calls) {
    assert.equal(call.options.method, "POST");
    assert.equal(new URL(call.url).search, "");
    assert.equal(call.options.cache, "no-store");
    assert.equal(call.options.redirect, "error");
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  const exchange = new URLSearchParams(String(f.calls[0].options.body));
  assert.equal(exchange.get("code"), "code+with&special=characters");
  assert.equal(exchange.get("client_secret"), "test-client-secret");
  assert.equal(exchange.get("grant_type"), "authorization_code");
  assert.equal(exchange.get("redirect_uri"), testEnv.TWITCH_REDIRECT_URI);
  const refresh = new URLSearchParams(String(f.calls[1].options.body));
  assert.equal(refresh.get("refresh_token"), "refresh+with&special=characters");
  assert.equal(refresh.get("grant_type"), "refresh_token");
  assert.equal(f.calls[2].url, "https://id.twitch.tv/oauth2/revoke");
});

test("validation and identity use the correct headers and expose only whitelisted profile fields", async () => {
  const f = client([
    Response.json({ client_id: "test-client", user_id: "123", expires_in: 3600, scopes: [] }),
    Response.json({ data: [{ id: "123", login: "viewer", display_name: "Viewer", profile_image_url: "https://static-cdn.jtvnw.net/example.png", email: "not-requested@example.com", broadcaster_type: "partner" }] }),
  ]);
  assert.deepEqual(await f.api.validate("test-access"), { clientId: "test-client", userId: "123", expiresIn: 3600 });
  assert.deepEqual(await f.api.profile("test-access"), { twitchUserId: "123", login: "viewer", displayName: "Viewer", profileImageUrl: "https://static-cdn.jtvnw.net/example.png" });
  assert.equal(f.calls[0].url, "https://id.twitch.tv/oauth2/validate");
  assert.equal(new Headers(f.calls[0].options.headers).get("authorization"), "OAuth test-access");
  assert.equal(f.calls[1].url, "https://api.twitch.tv/helix/users");
  assert.equal(new Headers(f.calls[1].options.headers).get("authorization"), "Bearer test-access");
  assert.equal(new Headers(f.calls[1].options.headers).get("client-id"), "test-client");
});

test("upstream network/status errors never propagate response bodies or private exception messages", async () => {
  const f = client([
    new Error("private-network-detail"), new Response("secret upstream body", { status: 400 }),
    new Response("private", { status: 401 }), new Response("private", { status: 503 }),
  ]);
  await assert.rejects(f.api.exchange("code"), error("unavailable"));
  await assert.rejects(f.api.exchange("code"), error("code"));
  await assert.rejects(f.api.validate("token"), error("invalid_token"));
  await assert.rejects(f.api.refresh("refresh"), error("unavailable"));
});

test("malformed, expired and app-only validation responses are rejected", async () => {
  for (const response of [
    Response.json({ client_id: "client", expires_in: 3600 }),
    Response.json({ client_id: "client", user_id: "123", expires_in: 0 }),
    Response.json({ client_id: "client", user_id: "123", expires_in: "3600" }),
    new Response("not-json"),
  ]) {
    await assert.rejects(client([response]).api.validate("token"), error("invalid_token"));
  }
  await assert.rejects(client([Response.json({ access_token: "token", token_type: "bearer" })]).api.exchange("code"), error("invalid_token"));
});

test("untrusted avatar URLs are omitted and ambiguous identities are rejected", async () => {
  for (const image of ["javascript:alert(1)", "http://static-cdn.jtvnw.net/x", "https://evil.example/x"]) {
    const f = client([Response.json({ data: [{ id: "123", login: "x", display_name: "X", profile_image_url: image }] })]);
    assert.equal((await f.api.profile("token")).profileImageUrl, null);
  }
  await assert.rejects(client([Response.json({ data: [] })]).api.profile("token"), error("invalid_token"));
});

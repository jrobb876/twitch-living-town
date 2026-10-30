import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { ApiRateLimiter } from "./rate-limit";
import { createHealthHandler } from "./health";
import { assertPublicBuild } from "./deployment";

test("OAuth rate budget cannot be bypassed by forged forwarded IPs or changing cookies", () => {
  let now = 1000; const limiter = new ApiRateLimiter(() => now);
  for (let i = 0; i < 60; i++) assert.equal(limiter.check(new NextRequest("https://town.example/api/auth/twitch/login", { headers: { "x-forwarded-for": `1.2.3.${i}`, cookie: `living-town-session=changed-${i}` } })), null);
  const rejected = limiter.check(new NextRequest("https://town.example/api/auth/twitch/login"))!;
  assert.equal(rejected.status, 429); assert.equal(rejected.headers.get("retry-after"), "60");
  now += 60001; assert.equal(limiter.check(new NextRequest("https://town.example/api/auth/twitch/login")), null);
});
test("mutation and bearer read budgets bound each identity without blocking normal OBS polls or health", () => {
  const limiter = new ApiRateLimiter();
  const mutation = () => new NextRequest("https://town.example/api/town/display", { method: "POST", headers: { cookie: "__Host-living-town-session=synthetic" } });
  for (let i = 0; i < 20; i++) assert.equal(limiter.check(mutation()), null);
  assert.equal(limiter.check(mutation())?.status, 429);
  for (let i = 0; i < 40; i++) assert.equal(limiter.check(new NextRequest("https://town.example/api/overlay/abc", { headers: { authorization: "Bearer synthetic" } })), null);
  assert.equal(limiter.check(new NextRequest("https://town.example/api/health")), null);
});
test("health checks coalesce, recover and expose no dependency details", async () => {
  let now = 1000, outage = true, calls = 0;
  const health = createHealthHandler(async () => { calls++; if (outage) throw new Error("private-url-and-secret"); }, () => now);
  const results = await Promise.all([health(), health()]); assert.equal(calls, 1);
  for (const r of results) { assert.equal(r.status, 503); assert.deepEqual(await r.json(), { status: "unavailable" }); }
  outage = false; now += 5001;
  const ok = await health(); assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), { status: "ok" });
});
test("public builds reject development tools without changing explicitly isolated local demos", () => {
  assert.throws(() => assertPublicBuild({ PUBLIC_DEPLOYMENT: "true", TOWN_DEMO_MODE: "true" }));
  assert.doesNotThrow(() => assertPublicBuild({ PUBLIC_DEPLOYMENT: "true", TOWN_DEMO_MODE: "false" }));
  assert.doesNotThrow(() => assertPublicBuild({ TOWN_DEMO_MODE: "true" }));
});

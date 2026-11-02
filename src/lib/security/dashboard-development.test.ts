import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AccountDashboard from "../../components/account-dashboard";
import { previewEnabled } from "../overlay/preview";
import { dashboardAccess, type DashboardData } from "../persistence/dashboard";
import { fixture } from "../auth/test-fixtures";
import { publicSampleTown } from "../simulation/public-sample";

const data: DashboardData = { profile: fixture().twitch.identity, csrfToken: "synthetic", town: { world: publicSampleTown(), revision: 1, updatedAt: "now" },
  houses: [], townUnavailable: false, housesUnavailable: false };

test("Dashboard development navigation follows the existing local demo gate while preserving ordinary sections", () => {
  for (const [env, host, visible] of [
    [{ NODE_ENV: "development", TOWN_DEMO_MODE: "true" }, "localhost:3000", true],
    [{ NODE_ENV: "development", TOWN_DEMO_MODE: "true" }, "127.0.0.1:3000", true],
    [{ NODE_ENV: "development", TOWN_DEMO_MODE: "false" }, "localhost:3000", false],
    [{ NODE_ENV: "development" }, "localhost:3000", false],
    [{ NODE_ENV: "production", TOWN_DEMO_MODE: "true" }, "localhost:3000", false],
    [{ NODE_ENV: "development", TOWN_DEMO_MODE: "true", PUBLIC_DEPLOYMENT: "true" }, "localhost:3000", false],
    [{ NODE_ENV: "development", TOWN_DEMO_MODE: "true" }, "public.example", false],
  ] as const) {
    const html = renderToStaticMarkup(createElement(AccountDashboard, { data, subscriberDemo: previewEnabled(env, host) }));
    assert.equal(html.includes('id="development-tools"'), visible);
    assert.match(html, /id="my-town"/); assert.match(html, /id="my-houses"/); assert.match(html, /Manage My Town/);
    for (const label of ["Open OBS Preview", "Try Subscriber Experience", "Open Town Simulator"]) {
      assert.equal(html.split(label).length - 1, visible ? 1 : 0);
    }
    if (visible) {
      assert.ok(html.indexOf('id="development-tools"') > html.indexOf('id="my-houses"'));
      assert.match(html, /href="\/demo\/obs-preview"/);
      assert.match(html, /href="\/town-overview">Open Town Simulator/);
      assert.match(html, /View Simulated Town/);
      assert.match(html, /These tools use simulated data and do not modify your live Twitch community/);
    }
  }
});

test("Dashboard still authenticates before lookup and only renders gated navigation after access succeeds", async () => {
  const f = fixture();
  await assert.rejects(dashboardAccess(f.service, () => { assert.fail("Unauthenticated Dashboard reached persistence"); }), { code: "unauthorized" });
  const source = await readFile("src/app/dashboard/page.tsx", "utf8");
  assert.match(source, /dashboardAccess\(getAuthService\(\), getTownPersistence/);
  assert.match(source, /previewEnabled\(process.env, \(await headers\(\)\).get\("host"\)\)/);
  assert.ok(source.indexOf('if (signIn) redirect("/account")') < source.indexOf("return <AccountDashboard"));
  assert.ok(source.indexOf("if (!data) return") < source.indexOf("return <AccountDashboard"));
});

test("consolidation reuses one subscriber control and leaves fixture, OBS and town authorization boundaries intact", async () => {
  const [dashboard, subscriber, obs, demoLayout, demoApi, overview] = await Promise.all([
    readFile("src/components/account-dashboard.tsx", "utf8"), readFile("src/components/subscriber-demo-entry.tsx", "utf8"),
    readFile("src/app/demo/obs-preview/page.tsx", "utf8"), readFile("src/app/demo/subscriber/layout.tsx", "utf8"),
    readFile("src/lib/houses/subscriber-demo-http.ts", "utf8"), readFile("src/app/town-overview/page.tsx", "utf8"),
  ]);
  assert.equal((dashboard.match(/<SubscriberDemoEntry\b/g) ?? []).length, 1);
  assert.ok(!dashboard.includes("fetch("), "Navigation must not activate fixtures or mutate saved towns");
  assert.match(subscriber, /fetch\("\/api\/demo\/subscriber"/);
  assert.match(subscriber, /Reset subscriber demo/); assert.match(subscriber, /<PropertyCards houses=\{\[data.property\]\}/);
  assert.match(obs, /if \(!previewEnabled\(process.env, \(await headers\(\)\).get\("host"\)\)\) notFound\(\)/);
  assert.match(demoLayout, /if \(!subscriberDemoEnabled\(\)\) notFound\(\)/);
  assert.match(demoApi, /if \(!enabled\(\)/); assert.match(demoApi, /auth.getProfile\(id, mutation\)/);
  assert.match(overview, /streamerAccess\(getAuthService\(\), getTownPersistence, id\)/);
  assert.match(overview, /initialTown=\{access.town\}/);
  const before = structuredClone(data);
  renderToStaticMarkup(createElement(AccountDashboard, { data, subscriberDemo: true }));
  assert.deepEqual(data, before, "Rendering navigation cannot change the saved town");
});

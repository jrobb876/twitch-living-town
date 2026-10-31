import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountProvider, type AccountState } from "../../components/account-context";
import { WebsiteNavigation } from "../../components/website-shell";
import PublicHome from "../../components/public-home";
import TownLoading from "../../components/town-loading";
import StreamerWorkspace from "../../components/streamer-workspace";
import TownExperience from "../../components/town-experience";
import { currentSection, primaryNavigation, standalonePresentation } from "./navigation";
import { publicSampleTown } from "../simulation/public-sample";
import { createSession, housesIn } from "../simulation/world";
import { tickTown } from "../simulation/engine";
import { signOutToHome } from "../auth/logout-client";

const signedOut: AccountState = { user: null, csrfToken: null };
const signedIn: AccountState = { user: { twitchUserId: "12345", displayName: "Test neighbor", login: "neighbor", profileImageUrl: null }, csrfToken: "synthetic-csrf" };
const render = (child: ReturnType<typeof createElement>, account = signedOut) => renderToStaticMarkup(createElement(AccountProvider, { initialAccount: account }, child));

test("public home remains available to both identities and changes only the primary account action", () => {
  const anonymous = render(createElement(PublicHome));
  assert.match(anonymous, /Your stream/); assert.match(anonymous, /Connect with Twitch/);
  assert.match(anonymous, /href="#how-it-works"/); assert.match(anonymous, /For Streamers/); assert.match(anonymous, /For Viewers/);
  const member = render(createElement(PublicHome), signedIn);
  assert.match(member, /Your stream/); assert.match(member, /Go to Dashboard/); assert.match(member, /href="\/dashboard"/);
  for (const html of [anonymous, member]) for (const forbidden of ["Event simulator", "Generate OBS URL", "test-access", "subscriberSync"]) assert.ok(!html.includes(forbidden));
  const sample = publicSampleTown(); assert.equal(sample.id, "public-meadow-sample");
  assert.equal(sample.residents.length, 0); assert.ok(housesIn(sample).every((house) => house.ownerTwitchUserId === null));
  const initial = createSession(sample); const animated = tickTown(initial, 1000);
  assert.equal(animated.world, sample); assert.equal(animated.runtime.now, 1000);
});

test("shared navigation has one current section, accessible mobile controls and read-only presentation exclusions", () => {
  for (const [path, active] of [["/dashboard", "/dashboard"], ["/dashboard/town", "/dashboard/town"], ["/onboarding", "/dashboard/town"], ["/my-houses/town/house", "/my-houses"], ["/town-overview", "/town-overview"]]) {
    assert.equal(currentSection(path), active);
    const html = render(createElement(WebsiteNavigation, { pathname: path }), signedIn);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    for (const item of primaryNavigation) assert.ok(html.includes(`href="${item.href}"`));
    assert.match(html, /aria-expanded="false"/); assert.match(html, /aria-controls="website-navigation"/); assert.match(html, /Sign out/);
  }
  const publicNav = render(createElement(WebsiteNavigation, { pathname: "/" }));
  assert.ok(!publicNav.includes('href="/dashboard/town"'));
  assert.equal(standalonePresentation("/overlay/town-id"), true);
  assert.equal(standalonePresentation("/demo/obs-preview"), true);
  assert.equal(standalonePresentation("/town-overview"), false);
});

test("successful logout navigates home only after acknowledgement; failures never navigate", async () => {
  const destinations: string[] = [];
  let acknowledge!: (value: Response) => void;
  const pending = signOutToHome("synthetic", (path) => destinations.push(path), () => new Promise((resolve) => { acknowledge = resolve; }));
  assert.deepEqual(destinations, []);
  acknowledge(Response.json({ signedOut: true })); await pending;
  assert.deepEqual(destinations, ["/"]);
  for (const response of [Response.json({ error: "forbidden" }, { status: 403 }), Response.json({ signedOut: false })]) {
    await assert.rejects(signOutToHome("synthetic", () => assert.fail("Failed logout navigated"), async () => response));
  }
});

test("shared loading announces contextual messages and stylesheet supports compact, mobile and reduced-motion states", async () => {
  for (const message of ["Finding your homes…", "Preparing your stream view…", "Opening your cottage…"]) {
    const html = renderToStaticMarkup(createElement(TownLoading, { message }));
    assert.ok(html.includes(message)); assert.match(html, /role="status"/); assert.match(html, /aria-live="polite"/); assert.match(html, /aria-hidden="true"/);
  }
  const css = await readFile("src/app/globals.css", "utf8");
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*\.loading-mayor[\s\S]*animation:none/);
  assert.match(css, /\.town-loading[^}]*justify-content:center/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.website-menu\.is-open/);
  assert.match(css, /\.town-visit \.workspace-preview[^}]*100svh/);
});

test("management uses mounted linked sections retaining original forms and useful deep links", () => {
  const world = publicSampleTown(); world.name = "Existing saved town";
  const html = renderToStaticMarkup(createElement(StreamerWorkspace, { initialTown: { world, revision: 1, updatedAt: "2026-10-30" }, csrfToken: "synthetic" }));
  for (const id of ["settings", "community", "obs"]) { assert.ok(html.includes(`href="#${id}"`)); assert.ok(html.includes(`id="${id}"`)); }
  assert.match(html, /Town &amp; Mayor/); assert.match(html, /Community/); assert.match(html, /Stream Display/);
  assert.match(html, /value="Existing saved town"/); assert.match(html, /value="Mochi"/); assert.match(html, /Save settings/);
  assert.ok(!html.includes('role="tab"'), "Anchor navigation does not unmount form panels");
});

test("Overview relocation reuses the original experience behind owner access while public home stays isolated", async () => {
  const [route, home, experience, shell] = await Promise.all([
    readFile("src/app/town-overview/page.tsx", "utf8"), readFile("src/app/page.tsx", "utf8"),
    readFile("src/components/town-experience.tsx", "utf8"), readFile("src/components/website-shell.tsx", "utf8"),
  ]);
  assert.match(route, /streamerAccess\(getAuthService\(\), getTownPersistence, id\)/);
  assert.match(route, /initialTown=\{access.town\}/); assert.match(route, /!access.town && !enableSimulator/);
  assert.match(route, /PUBLIC_DEPLOYMENT !== "true"/);
  assert.match(home, /PublicHome/); assert.ok(!home.includes("TownExperience"));
  for (const feature of ["PersistentTown", "SubscriberHousing", "ChatConnection", "TownCanvas", "enableSimulator && mode === \"simulated\""]) assert.ok(experience.includes(feature));
  assert.ok(shell.indexOf("if (standalonePresentation(pathname)) return children") < shell.indexOf("return <AccountProvider>"));
});

test("interactive Overview begins with the saved town rather than flashing a generated placeholder", () => {
  const world = publicSampleTown(); world.name = "Saved community town"; world.id = "saved-town-fixture";
  const html = renderToStaticMarkup(createElement(TownExperience, { initialTown: { world, revision: 1, updatedAt: "2026-10-30" }, enableSimulator: false }));
  assert.match(html, /Welcome to Saved community town/);
  assert.ok(!html.includes("Regenerate town")); assert.ok(!html.includes("Regenerate demo town"));
  assert.ok(!html.includes("Reload saved town")); assert.match(html, /Manage My Town/);
  assert.ok(!html.includes("Welcome to Willowbrook")); assert.ok(!html.includes("Event simulator"));
  assert.match(html, /Your town/); assert.match(html, /Twitch chat/);
});

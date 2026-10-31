import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { AccountProvider, type AccountState } from "../../components/account-context";
import { WebsiteNavigation } from "../../components/website-shell";
import TownExperience from "../../components/town-experience";
import { createAuthHandlers } from "../auth/http";
import { cookieNames } from "../auth/config";
import { fixture } from "../auth/test-fixtures";
import { publicSampleTown } from "../simulation/public-sample";

test("development uses verified HMR bundler without changing production build/start", async () => {
  const { scripts } = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(scripts.dev, "next dev --webpack");
  assert.equal(scripts.build, "next build");
  assert.equal(scripts.start, "next start");
});

test("successful session responses resolve account loading without withholding the saved Overview", async () => {
  const f = fixture(), login = await f.login();
  const handlers = createAuthHandlers(() => f.service, false);
  const savedTown = { world: publicSampleTown(), revision: 1, updatedAt: "2026-10-31" };
  const render = (url: string, account?: AccountState) => renderToStaticMarkup(createElement(AccountProvider, { initialAccount: account },
    createElement(WebsiteNavigation, { pathname: new URL(url).pathname }),
    createElement(TownExperience, { initialTown: savedTown })));
  const loading = render("http://localhost:3000/town-overview");
  assert.match(loading, /Checking account…/);
  assert.match(loading, /id="town-title"/); // Account lookup never gates the entire town.
  for (const suffix of ["", "?utm_source=chatgpt.com", ""]) {
    const response = await handlers.session(new NextRequest(`http://localhost:3000/api/auth/session${suffix}`, {
      headers: { Cookie: `${cookieNames(false).session}=${login.id}` },
    }));
    assert.equal(response.status, 200); assert.equal(response.headers.get("location"), null);
    const account = await response.json() as AccountState;
    const html = render(`http://localhost:3000/town-overview${suffix}`, account);
    assert.ok(!html.includes("Checking account…"));
    assert.match(html, /Sign out/); assert.match(html, /Manage My Town/);
    assert.match(html, /MEET YOUR MAYOR/); assert.match(html, /Twitch chat/);
    assert.equal((html.match(/id="town-title"/g) ?? []).length, 1);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.deepEqual(account.user, f.twitch.identity);
  }
  assert.equal(f.twitch.revocations.length, 0);
  assert.equal(f.twitch.exchanges.length, 1); // Session reads never restart OAuth.
});

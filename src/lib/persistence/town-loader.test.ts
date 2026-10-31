import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTownLoader, type TownLoadState } from "./town-loader";
import type { StoredTown } from "./types";
import { publicSampleTown } from "../simulation/public-sample";
import { SavedTownStatus } from "../../components/persistent-town";
import TownExperience from "../../components/town-experience";

const town = (): StoredTown => ({ world: publicSampleTown(), revision: 1, updatedAt: "2026-10-30" });
const status = (state: TownLoadState | null, pending = false) => renderToStaticMarkup(createElement(SavedTownStatus, { state, pending, onRetry() {} }));

test("saved-town refresh is a credentialed read; failures preserve the town and contextual retry clears on recovery", async () => {
  const saved = town(), updates: (StoredTown | null)[] = [], states: TownLoadState[] = [], pending: boolean[] = [];
  let response = Response.json({ town: saved });
  const loader = createTownLoader((s) => states.push(s), (t) => updates.push(t), (p) => pending.push(p), saved, async (url, options) => {
    assert.equal(url, "/api/town"); assert.equal(options?.method, "GET"); assert.equal(options?.body, undefined);
    assert.equal(options?.credentials, "same-origin"); assert.equal(options?.cache, "no-store"); assert.ok(options?.signal);
    return response;
  });
  await loader.refresh(); assert.deepEqual(updates, [saved]); assert.deepEqual(pending, [true, false]);
  const success = status(states.at(-1)!); assert.match(success, /Manage My Town/); assert.ok(!success.includes("Retry")); assert.ok(!success.includes("Reload saved town"));
  response = Response.json({ error: "unavailable", message: "Storage unavailable" }, { status: 503 });
  await loader.refresh(); assert.equal(updates.length, 1); assert.deepEqual(states.at(-1)?.town, saved);
  const failed = status(states.at(-1)!); assert.match(failed, /role="alert"/); assert.match(failed, />Retry</); assert.match(failed, /Manage My Town/);
  assert.match(status(states.at(-1)!, true), /disabled=""[^>]*>Retrying…/);
  response = Response.json({ town: saved }); await loader.refresh(); assert.equal(updates.length, 2); assert.ok(!status(states.at(-1)!).includes("Retry"));
  response = Response.json({ error: "unauthorized" }, { status: 401 }); await loader.refresh(); assert.equal(updates.at(-1), null);
  loader.dispose();
});

test("network failures offer retry and superseded/unmounted reads cannot replace saved state", async () => {
  const saved = town(), states: TownLoadState[] = [], updates: (StoredTown | null)[] = [];
  let finish!: (response: Response) => void, calls = 0;
  const loader = createTownLoader((s) => states.push(s), (t) => updates.push(t), () => {}, saved, async () => {
    calls++;
    if (calls === 1) return new Promise((resolve) => { finish = resolve; });
    throw new TypeError("synthetic offline");
  });
  const old = loader.refresh(); await loader.refresh();
  assert.match(status(states[0]), />Retry</); assert.deepEqual(states[0].town, saved);
  finish(Response.json({ town: null })); await old; assert.equal(states.length, 1); assert.deepEqual(updates, []);
  const disposed = createTownLoader(() => assert.fail("Unmounted state updated"), () => assert.fail("Unmounted town updated"), () => {}, saved,
    () => new Promise((resolve) => { finish = resolve; }));
  const waiting = disposed.refresh(); disposed.dispose(); finish(Response.json({ town: saved })); await waiting;
});

test("automatic mount/focus/event refresh remains wired; normal pending and no-town states do not offer reload", async () => {
  const source = await readFile("src/components/persistent-town.tsx", "utf8");
  assert.match(source, /refresh\(\); window.addEventListener\("focus", refresh\); window.addEventListener\("living-town:reload", refresh\)/);
  assert.match(source, /loader.dispose\(\)/);
  assert.ok(!status(null, true).includes("Retry"));
  const empty = status({ town: null }); assert.match(empty, /Create my town/); assert.ok(!empty.includes("Retry"));
});

test("regeneration is absent in production and saved views, and available only in an authorized development demo", () => {
  const env = process.env as Record<string, string | undefined>, prior = env.NODE_ENV;
  try {
    for (const [runtime, allowed, saved, visible] of [
      ["production", false, town(), false], ["production", true, null, false],
      ["development", false, null, false], ["development", true, town(), false], ["development", true, null, true],
    ] as const) {
      env.NODE_ENV = runtime;
      const html = renderToStaticMarkup(createElement(TownExperience, { initialTown: saved, enableSimulator: allowed }));
      assert.equal(html.includes("Regenerate demo town"), visible);
      assert.ok(!html.includes("Reload saved town")); assert.ok(!html.includes("Regenerate town"));
      if (saved) { assert.ok(html.includes(saved.world.name)); assert.match(html, /Manage My Town/); }
    }
  } finally { if (prior === undefined) delete env.NODE_ENV; else env.NODE_ENV = prior; }
});

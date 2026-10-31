import assert from "node:assert/strict";
import test from "node:test";
import { PresentationCursor } from "./presentation-cursor";

test("a new or refreshed view baselines buffered events and accepts only subsequent unique presentations", () => {
  const old = { id: "old", expiresAt: 15000 }, fresh = { id: "new", expiresAt: 16000 };
  const view = new PresentationCursor();
  assert.deepEqual(view.take([old], 1000), []);
  assert.deepEqual(view.take([old, fresh, fresh], 2000), [fresh]);
  assert.deepEqual(view.take([old, fresh], 3000), []);
  const refreshed = new PresentationCursor();
  assert.deepEqual(refreshed.take([old, fresh], 4000), []);
  const next = { id: "after-refresh", expiresAt: 18000 };
  assert.deepEqual(refreshed.take([old, fresh, next], 5000), [next]);
  assert.deepEqual(refreshed.take([old, fresh, next], 20000), []);
});

test("independent views each receive new events, retain deduplication across reconnect and reset on disposal", () => {
  const a = new PresentationCursor(), b = new PresentationCursor();
  a.take([], 0); b.take([], 0);
  const event = { id: "shared", expiresAt: 15000 };
  assert.deepEqual(a.take([event], 1000), [event]);
  assert.deepEqual(b.take([event], 1000), [event]);
  // An outage does not reset the cursor. The first later poll still admits genuinely new work.
  const next = { id: "after-reconnect", expiresAt: 18000 };
  assert.deepEqual(a.take([event, next], 5000), [next]);
  a.clear(); assert.deepEqual(a.take([event, next], 6000), []);
  assert.deepEqual(b.take([next], 6000), [next]);
});

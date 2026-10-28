import assert from "node:assert/strict";
import test from "node:test";
import { createChatDiagnosticLogger } from "./diagnostics";
import { mapChatNotification } from "./mapping";
import { chatMessage, NOW } from "./test-fixtures";

test("chat diagnostics select safe fields, classify network errors, and can be disabled", () => {
  const entries: Record<string, unknown>[] = [];
  let enabled = true;
  const log = createChatDiagnosticLogger((entry) => { entries.push(entry); }, () => enabled);
  const details = { httpStatus: 202, enabled: true, websocket: true, subscriptionIdPresent: true,
    accessToken: "secret-token", text: "private chat", cookie: "private-cookie", url: "https://private.invalid/?code=secret" };
  log("subscription_create", "success", details);
  log("subscription_create", "failure", {}, new Error("secret token and URL", { cause: { code: "ENOTFOUND", message: "private URL" } }));
  assert.deepEqual(entries[0], { event: "twitch_chat", operation: "subscription_create", outcome: "success",
    endpoint: "api.twitch.tv/helix/eventsub/subscriptions", enabled: true, websocket: true, subscriptionIdPresent: true, httpStatus: 202 });
  assert.equal(entries[1].category, "dns");
  for (const secret of ["secret-token", "private chat", "private-cookie", "private.invalid", "secret token and URL", "private URL"]) assert.ok(!JSON.stringify(entries).includes(secret));
  enabled = false; log("notification", "received"); assert.equal(entries.length, 2);
  const broken = createChatDiagnosticLogger(() => { throw new Error("logger unavailable"); }, () => true);
  assert.doesNotThrow(() => broken("notification", "received"));
});

test("mapping diagnostics distinguish bad IDs, clocks and channel routing without including chat content", () => {
  const cases: [string, (input: ReturnType<typeof chatMessage>) => void][] = [
    ["invalid_message_id", (input) => { input.payload.event.message_id = ""; }],
    ["invalid_timestamp", (input) => { input.metadata.message_timestamp = "no timestamp"; }],
    ["stale_timestamp", (input) => { input.metadata.message_timestamp = new Date(NOW - 600_000).toISOString(); }],
    ["future_timestamp", (input) => { input.metadata.message_timestamp = new Date(NOW + 61_000).toISOString(); }],
    ["channel_mismatch", (input) => { input.payload.subscription.condition.user_id = "999"; }],
  ];
  for (const [reason, mutate] of cases) {
    const input = chatMessage(); mutate(input);
    const reasons: string[] = [];
    assert.equal(mapChatNotification(input, "12345", NOW, (value) => reasons.push(value)), null);
    assert.deepEqual(reasons, [reason]);
  }
});

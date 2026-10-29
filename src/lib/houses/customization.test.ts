import assert from "node:assert/strict";
import test from "node:test";
import { colors, customizeDemo, customizeHouse, exteriorOf, exteriorSchema, houseVisual } from "./customization";
import { createWorld, housesIn } from "../simulation/world";
import { overviewOf } from "../rendering/overview";
import { simulatorEnabled } from "../simulation/config";
import { fixture } from "../auth/test-fixtures";
import { AuthError, SUBSCRIPTION_SCOPE } from "../auth/types";
import { TwitchSubscriptions } from "../subscribers/twitch";
import { PersistenceError } from "../persistence/types";
import { membershipVerifier } from "./verification";

const demo = () => createWorld({ id: "demo-house-editor", streamerTwitchUserId: "sim-streamer", seed: 42, name: "Demo", mayorName: "Mochi" });
test("draft preview and reset leave saved data untouched; applied appearance reaches the shared Overview model", () => {
  const world = demo(), house = housesIn(world)[0], before = structuredClone(world);
  const draft = { ...exteriorOf(house), houseName: "Nori's Nook", roof: "sage" as const, wall: "cream" as const, door: "rose" as const, fence: "honey" as const, garden: "herbs" as const, accent: "lantern" as const };
  const preview = customizeHouse(house, draft);
  assert.deepEqual(world, before); assert.notDeepEqual(preview, house);
  assert.deepEqual(customizeHouse(house, exteriorOf(house)).appearance, house.appearance);
  const applied = customizeDemo(world, house.id, draft);
  assert.deepEqual(overviewOf(applied).houses.find((item) => item.id === house.id), houseVisual(preview));
  const visible = houseVisual(preview);
  assert.equal(visible.roof, colors.sage); assert.equal(visible.wall, colors.cream); assert.equal(visible.door, colors.rose);
  assert.equal(visible.fence, colors.honey); assert.equal(visible.garden, "herbs"); assert.equal(visible.accent, "lantern"); assert.equal(visible.name, "Nori's Nook");
  assert.deepEqual(applied.layout, world.layout); assert.deepEqual(applied.plots, world.plots);
  assert.equal(applied.residents.length, 0); assert.ok(housesIn(applied).every((item) => item.ownerTwitchUserId === null));
});
test("customization allowlist rejects protected keys, arbitrary artwork/colors and unsafe names", () => {
  const draft = exteriorOf(housesIn(demo())[0]);
  for (const input of [{ ...draft, prestige: 5 }, { ...draft, ownerTwitchUserId: "999" }, { ...draft, roof: "#123456" }, { ...draft, garden: "https://example.com/art" },
    { ...draft, houseName: "<img onerror=alert(1)>" }, { ...draft, houseName: "bad\nname" }, { ...draft, houseName: "x".repeat(41) }]) assert.equal(exteriorSchema.safeParse(input).success, false);
  assert.equal(exteriorSchema.parse({ ...draft, houseName: "  Café Nori  " }).houseName, "Café Nori");
});
test("demo gate and sample editor cannot mutate an actual owned world", () => {
  assert.equal(simulatorEnabled("production", undefined), false); assert.equal(simulatorEnabled("production", "true"), true);
  const world = demo(), draft = exteriorOf(housesIn(world)[0]);
  assert.throws(() => customizeDemo({ ...world, id: "real-town" }, "home-1", draft));
  housesIn(world)[0].ownerTwitchUserId = "12345";
  assert.throws(() => customizeDemo(world, "home-1", draft));
});
test("fresh membership uses the matching broadcaster's existing scoped session and fails closed", async () => {
  const f = fixture(); f.twitch.validation.scopes = [SUBSCRIPTION_SCOPE]; await f.login();
  const api = new TwitchSubscriptions("test-client"); let calls = 0;
  api.page = async (token, broadcaster, cursor, userId) => {
    calls++; assert.equal(token, "test-access"); assert.equal(broadcaster, "12345"); assert.equal(cursor, undefined); assert.equal(userId, "777");
    return { subscribers: [{ twitchUserId: "777", displayName: "Fixture", tier: "1000", isGift: false }] };
  };
  const verify = membershipVerifier(f.service, api); await verify("12345", "777"); assert.equal(calls, 1);
  await assert.rejects(verify("999", "777"), (e: unknown) => e instanceof PersistenceError && e.code === "unavailable"); assert.equal(calls, 1);
  api.page = async () => ({ subscribers: [] });
  await assert.rejects(verify("12345", "777"), (e: unknown) => e instanceof PersistenceError && e.code === "forbidden");
  api.page = async () => { throw new AuthError("invalid_token"); };
  await assert.rejects(verify("12345", "777"), (e: unknown) => e instanceof PersistenceError && e.code === "unavailable");
  await assert.rejects(f.service.subscriptionCredentialsFor("12345"));
});

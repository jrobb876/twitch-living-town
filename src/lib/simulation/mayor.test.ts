import assert from "node:assert/strict";
import test from "node:test";
import { createSession, createWorld } from "./world";
import { advanceMayor } from "./behavior";
import { mayorStroll, mayorPause } from "../mayor/behavior";
import { personalityFor, personalityNames } from "../mayor/presets";

const world = () => createWorld({ id: "test", streamerTwitchUserId: "test", name: "Town", mayorName: "Mochi", seed: 42 });
test("Mayor personalities deterministically bias walks and pauses without changing travel speed", () => {
  const town = world(), mayor = createSession(town).runtime.mayor;
  mayor.nodeId = "1-1"; mayor.previousNodeId = "1-0"; mayor.position = { x: 500, y: 630 };
  const choices: Record<string, (string | undefined)[]> = {};
  for (const preset of personalityNames) {
    town.mayor.personality = personalityFor(preset);
    choices[preset] = Array.from({ length: 100 }, (_, steps) => mayorStroll({ ...mayor, steps }, town));
    assert.deepEqual(choices[preset], Array.from({ length: 100 }, (_, steps) => mayorStroll({ ...mayor, steps }, town)));
  }
  assert.ok(choices.playful.filter((id) => id === "1-2").length > 50);
  assert.ok(choices.curious.filter((id) => id?.startsWith("home-")).length > 65);
  assert.ok(choices.mischievous.filter((id) => id === "1-0").length > 50);
  town.mayor.personality = personalityFor("calm"); const calm = mayorPause(town, 1800);
  town.mayor.personality = personalityFor("playful"); assert.ok(calm > mayorPause(town, 1800) * 3);
  const moving = { ...mayor, targetNodeId: "1-2", restUntil: 0 };
  const playful = advanceMayor(moving, town, 2000, 100, 0);
  town.mayor.personality = personalityFor("calm");
  assert.deepEqual(advanceMayor(moving, town, 2000, 100, 0).position, playful.position);
});
test("event tasks retain priority and legacy Mayor movement is preserved", () => {
  const town = world(), mayor = createSession(town).runtime.mayor;
  assert.equal(mayorStroll(mayor, town), undefined); assert.equal(mayorPause(town, 1800), 1800);
  const tasked = { ...mayor, restUntil: 0, tasks: [{ nodeId: "hall", kind: "welcome" as const, expiresAt: 100000 }] };
  const results = personalityNames.map((preset) => { town.mayor.personality = personalityFor(preset); return advanceMayor(tasked, town, 2000, 100, 0); });
  for (const result of results) { assert.equal(result.behavior, "approaching"); assert.deepEqual(result.position, results[0].position); assert.equal(result.targetNodeId, results[0].targetNodeId); }
});

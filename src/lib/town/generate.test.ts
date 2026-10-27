import assert from "node:assert/strict";
import test from "node:test";
import { generateTown } from "./generate";

test("a seed reproduces the complete town and different seeds vary its appearance", () => {
  assert.deepEqual(generateTown(42), generateTown(42));
  assert.notDeepEqual(generateTown(42).houses, generateTown(43).houses);
});

test("towns have 12 varied homes, expansion space, and a connected navigation graph", () => {
  for (const seed of [0, 1, 42, 2026, 0xffffffff]) {
    const town = generateTown(seed);
    assert.equal(town.houses.length, 12);
    assert.ok(new Set(town.houses.map((h) => h.roof)).size > 1);
    assert.equal(town.expansion.length, 2);
    const nodes = new Map(town.navigation.map((node) => [node.id, node]));
    const seen = new Set<string>();
    const queue = ["hall"];
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = nodes.get(id)!;
      assert.ok(node, `missing node ${id}`);
      for (const neighbor of node.neighbors) {
        assert.ok(nodes.get(neighbor)?.neighbors.includes(id), "paths must be bidirectional");
        queue.push(neighbor);
      }
    }
    assert.equal(seen.size, nodes.size);
    for (const house of town.houses) {
      assert.ok(seen.has(house.id));
      assert.ok(house.x > 0 && house.x < town.width && house.y > 0 && house.y < town.height);
    }
  }
});

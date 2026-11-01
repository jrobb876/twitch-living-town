import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

test("Overview sibling keys are distinct, stable across refreshes, and reset on town changes", async () => {
  // Inspect the actual JSX keys: server rendering alone does not exercise
  // React's client reconciliation warning for duplicate sibling keys.
  const source = ts.createSourceFile("town-experience.tsx", await readFile("src/components/town-experience.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const expressions = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && ["CommunityConnection", "SubscriberHousing"].includes(node.tagName.getText(source))) {
      const key = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "key");
      assert.ok(key && ts.isJsxAttribute(key) && key.initializer && ts.isJsxExpression(key.initializer) && key.initializer.expression);
      expressions.set(node.tagName.getText(source), key.initializer.expression.getText(source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(expressions.size, 2);
  const keys = (id: string | null) => [...expressions.values()].map((expression) => runInNewContext(`(${expression})`, {
    savedTown: id === null ? null : { world: { id } },
  }) as string);
  const townId = "1e0508e0-3d03-4a1c-b4a4-f435a8ab0c95";
  for (const id of [null, townId, "another-town"]) {
    const current = keys(id);
    assert.equal(new Set(current).size, current.length, "sibling keys must never collide");
    assert.deepEqual(keys(id), current, "a refreshed town object must retain component identity");
    assert.ok(current.every((key) => typeof key === "string"));
  }
  for (let index = 0; index < 2; index++) {
    assert.notEqual(keys(townId)[index], keys("another-town")[index]);
    assert.notEqual(keys(null)[index], keys(townId)[index]);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as jsxRuntime from "react/jsx-runtime";
import type { ReactElement } from "react";
import ts from "typescript";

type Child = ReactElement<{ onReload?: () => void; onFind?: () => void; onClick?: () => void }>;

/** Execute the real component's returned JSX with controlled hook state. This
 * inspects sibling element keys directly: SSR markup omits keys and doesn't
 * exercise the client reconciler's duplicate-key warning. No browser needed. */
async function editorHarness() {
  const source = await readFile("src/components/owned-house-editor.tsx", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const loaded = () => ({ property: { revision: 1 }, csrfToken: "synthetic" });
  const states: unknown[] = [loaded(), "", 0, 0];
  let cursor = 0;
  let dependencies: unknown[] = [];
  const exports: { default?: (props: { townId: string; houseId: string; demo: boolean }) => ReactElement<{ children: Child[] }> } = {};
  runInNewContext(compiled, { exports, require: (name: string) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "react") return {
      useEffect: (_effect: unknown, deps: unknown[]) => { dependencies = [...deps]; },
      useState: () => {
        const index = cursor++;
        return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
    };
    const components: Record<string, string> = { "./house-editor": "HouseEditor", "./property-town-map": "PropertyTownMap", "./town-loading": "TownLoading", "next/link": "Link" };
    assert.ok(components[name], `Unexpected runtime dependency: ${name}`);
    return { __esModule: true, default: components[name] };
  } });
  return {
    render(demo: boolean, houseId = "house:plot-13") {
      cursor = 0;
      return exports.default!({ demo, townId: "owned-town", houseId });
    },
    resolve() { states[0] = loaded(); },
    dependencies: () => dependencies,
  };
}

for (const demo of [true, false]) test(`${demo ? "Maplebrook" : "genuine"} editor siblings have unique stable keys and both remount on retry`, async () => {
  const harness = await editorHarness();
  const children = () => Array.from(harness.render(demo).props.children);
  const first = children();
  assert.deepEqual(first.map((child) => child.type), ["HouseEditor", "PropertyTownMap"]);
  const keys = first.map((child) => child.key);
  assert.equal(new Set(keys).size, 2, "actual sibling elements must not share the endpoint/attempt key");
  assert.ok(keys.every((key) => key !== null));
  assert.deepEqual(children().map((child) => child.key), keys);
  first[0].props.onFind!();
  assert.deepEqual(children().map((child) => child.key), keys, "camera requests must not remount either child");
  harness.resolve();
  assert.deepEqual(children().map((child) => child.key), keys, "new saved-property objects retain component identity");
  const priorDependencies = harness.dependencies();
  first[0].props.onReload!();
  assert.equal(harness.render(demo).type, "TownLoading");
  assert.equal(harness.dependencies()[1], Number(priorDependencies[1]) + 1, "retry re-runs loading");
  harness.resolve();
  const retried = children().map((child) => child.key);
  assert.equal(new Set(retried).size, 2);
  for (let i = 0; i < keys.length; i++) assert.notEqual(retried[i], keys[i], "retry intentionally remounts both children");
  assert.deepEqual(children().map((child) => child.key), retried);
  if (!demo) {
    const changed = harness.render(false, "another-house").props.children.map((child) => child.key);
    for (let i = 0; i < retried.length; i++) assert.notEqual(changed[i], retried[i], "changing the property endpoint remounts both children");
  }
});

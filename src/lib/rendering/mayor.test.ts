import assert from "node:assert/strict";
import test from "node:test";
import { Graphics } from "pixi.js";
import { drawMayor } from "./draw-town";
import { mayorPalette, mayorLooks } from "../mayor/presets";

test("procedural Mayor graphics use each selected palette and retain the legacy cream appearance", () => {
  assert.deepEqual(mayorPalette("default"), mayorPalette("cream"));
  assert.deepEqual(mayorPalette(), mayorPalette("cream"));
  const faces = new Set<number>();
  for (const preset of mayorLooks) {
    const visual = drawMayor(preset), colors = mayorPalette(preset);
    const cat = visual.body.children[1] as Graphics;
    const fills = cat.context.instructions.flatMap((instruction) => instruction.action === "fill" ? [instruction.data.style.color] : []);
    assert.ok(fills.includes(colors.face)); assert.ok(fills.includes(colors.body)); assert.ok(fills.includes(colors.eyes));
    faces.add(colors.face); visual.mayor.destroy({ children: true });
  }
  assert.equal(faces.size, 4);
});

import { Container, Graphics, Text } from "pixi.js";
import { housewarmingPose } from "./housewarming";

export function drawHousewarming(label: string) {
  const view = new Container();
  // Outline follows the cottage roof and walls, leaving the facade unobscured.
  const outline = [-76, -27, -50, -79, 46, -79, 76, -27, 62, -27, 62, 57, -62, 57, -62, -27, -76, -27];
  view.addChild(new Graphics().poly(outline).stroke({ color: 0xffdb82, width: 12, alpha: 0.14 })
    .poly(outline).stroke({ color: 0xffdf8a, width: 3, alpha: 0.9 }));
  const sparkles = new Graphics();
  for (const [x, y, size] of [[-62, -87, 4], [-26, -96, 3], [12, -88, 4], [58, -93, 3]]) {
    sparkles.poly([x, y - size, x + size, y, x, y + size, x - size, y]).fill(0xffe7a2);
  }
  view.addChild(sparkles);
  const caption = new Container(); caption.y = -115;
  const text = new Text({ text: label, style: { fontFamily: "Arial", fontSize: 12, fontWeight: "600", fill: 0x655139,
    wordWrap: true, wordWrapWidth: 175, align: "center" } });
  text.anchor.set(0.5);
  caption.addChild(new Graphics().roundRect(-text.width / 2 - 8, -text.height / 2 - 5, text.width + 16, text.height + 10, 7)
    .fill({ color: 0xfff7dd, alpha: 0.96 }).stroke({ color: 0xe4c479, width: 1 }), text);
  view.addChild(caption);
  return { view, update(age: number, reduced: boolean, spotlight: boolean, scale: number) {
    const pose = housewarmingPose(age, reduced, spotlight, scale);
    view.alpha = pose.alpha; sparkles.y = pose.lift; sparkles.alpha = pose.sparkleAlpha;
    caption.y = -115 + pose.lift; caption.visible = pose.showLabel;
  } };
}

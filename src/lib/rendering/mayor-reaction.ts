import { Container, Graphics, Text } from "pixi.js";
import type { drawMayor } from "./draw-town";
import type { PlayingReaction } from "../mayor/reactions";
import type { MayorPersonality } from "../mayor/presets";
import { MAX_REACTION_PARTICLES, reactionParticle, reactionPose } from "../mayor/reaction-pose";

export function attachMayorReaction(view: ReturnType<typeof drawMayor>) {
  const layer = new Container(); view.mayor.addChild(layer);
  const particles = Array.from({ length: MAX_REACTION_PARTICLES }, (_, i) => {
    const graphic = new Graphics().poly([0, -2, 1, -0.7, 2, 0, 0.7, 1, 0, 2, -0.7, 1, -2, 0, -1, -0.7]).fill([0xf1cc73, 0xe3a6b0, 0x8bbfb3, 0xc1a4d0][i % 4]);
    layer.addChild(graphic); return graphic;
  });
  const gift = new Graphics().roundRect(-7, -7, 14, 12, 2).fill(0xc6a6d8).rect(-1, -7, 2, 12).fill(0xffebbc)
    .roundRect(-8, -9, 16, 4, 1).fill(0xe6b1bd).ellipse(-3, -11, 3, 2).ellipse(3, -11, 3, 2).stroke({ color: 0xffebbc, width: 2 });
  gift.position.set(25, -34); layer.addChild(gift);
  const quantity = new Text({ text: "", style: { fontFamily: "Arial", fontSize: 7, fontWeight: "bold", fill: 0xfff3cf, stroke: { color: 0x405c4d, width: 2 } } });
  quantity.anchor.set(0.5); quantity.position.set(0, -71); layer.addChild(quantity);
  layer.visible = false;
  return {
    update(reaction: PlayingReaction | null | undefined, now: number, personality: MayorPersonality | undefined, reduced: boolean) {
      const pose = reactionPose(reaction, now, personality, reduced);
      layer.visible = pose.alpha > 0; layer.alpha = pose.alpha;
      view.leftPaw.rotation = pose.leftPaw; view.rightPaw.rotation = pose.rightPaw;
      view.body.x = pose.x;
      if (pose.alpha > 0) { view.body.y = pose.y; view.body.rotation = pose.rotation; }
      gift.visible = pose.gift; quantity.text = pose.quantity;
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i]; particle.visible = i < pose.particles;
        if (!particle.visible) continue;
        const position = reactionParticle(i, (now - reaction!.startedAt) / 1000, reaction!.kind === "gift");
        particle.position.set(position.x, position.y); particle.alpha = position.alpha; particle.rotation = position.rotation; particle.scale.set(position.scale);
      }
    },
  };
}

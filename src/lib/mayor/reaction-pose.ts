import type { PlayingReaction } from "./reactions";
import type { MayorPersonality } from "./presets";

export const REACTION_BOUNDS = { left: -38, right: 38, top: -76, bottom: 12 };
export const MAX_REACTION_PARTICLES = 24;
/** Shared local-space pose; camera/foreground scale never changes the animation timing. */
export function reactionPose(reaction: PlayingReaction | null | undefined, now: number, personality?: MayorPersonality, reduced = false) {
  const pose = { x: 0, y: 0, rotation: 0, leftPaw: 0, rightPaw: 0, particles: 0, alpha: 0, gift: false, quantity: "" };
  if (!reaction || now < reaction.startedAt || now >= reaction.until) return pose;
  const age = (now - reaction.startedAt) / 1000, duration = (reaction.until - reaction.startedAt) / 1000;
  const envelope = Math.min(1, age / 0.2, (duration - age) / 0.35);
  const energy = 0.8 + Math.max(0, Math.min(1, personality?.energy ?? 0.5)) * 0.3;
  pose.alpha = envelope; pose.gift = reaction.kind === "gift" || reaction.kind === "gift-recipient";
  pose.quantity = reaction.quantity ? `${reaction.quantity} gifts` : "";
  if (reduced) { pose.leftPaw = -0.5; pose.rightPaw = 0.5; return pose; }
  const wave = Math.sin(age * 10), bounce = Math.abs(Math.sin(age * Math.PI * 2.2));
  switch (reaction.kind) {
    case "follower": pose.rightPaw = 1.2 + wave * 0.35; break;
    case "resubscription": pose.x = Math.sin(age * 7) * 4; pose.y = -bounce * 3; pose.rotation = Math.sin(age * 7) * 0.13; pose.leftPaw = -0.8 - wave * 0.3; pose.rightPaw = 0.8 - wave * 0.3; break;
    case "gift-recipient": pose.y = -bounce * 5; pose.rightPaw = 1.4 + wave * 0.4; pose.leftPaw = -0.4; break;
    case "gift": pose.y = -bounce * 9; pose.x = Math.sin(age * 8) * 3; pose.rotation = Math.sin(age * 8) * 0.1; pose.leftPaw = -1.3 - wave * 0.3; pose.rightPaw = 1.3 + wave * 0.3; break;
    default: pose.y = -bounce * 7; pose.leftPaw = -1.1; pose.rightPaw = 1.1;
  }
  pose.x *= envelope * energy; pose.y *= envelope * energy; pose.rotation *= envelope * energy;
  pose.leftPaw *= envelope; pose.rightPaw *= envelope;
  pose.particles = reaction.particles === "none" ? 0 : reaction.particles === "confetti" ? MAX_REACTION_PARTICLES : 10;
  return pose;
}
/** Deterministic bounded particle trajectories; fixed graphics are recycled, never allocated per frame. */
export function reactionParticle(index: number, age: number, confetti: boolean) {
  const phase = (age * (confetti ? 0.6 : 0.85) + index * 0.137) % 1;
  return { x: Math.sin(index * 2.4) * (14 + phase * 19), y: -26 - Math.sin(phase * Math.PI) * 44,
    alpha: Math.sin(phase * Math.PI), rotation: age * 2 + index, scale: confetti ? 0.8 : 0.6 + Math.sin(phase * Math.PI) * 0.4 };
}

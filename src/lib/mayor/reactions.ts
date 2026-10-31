import type { TownEffect, TownEvent, TownWorld, WorldPosition } from "../simulation/types";

export type ReactionKind = "subscriber" | "resubscription" | "gift-recipient" | "gift" | "follower" | "neighborhood" | "raid" | "bits" | "donation";
export type ReactionCue = { id: string; kind: ReactionKind; position: WorldPosition; expiresAt: number; quantity?: number };
export type MayorReaction = ReactionCue & { priority: number; duration: number; label: string; particles: "sparkles" | "confetti" | "gift" | "none" };
export type PlayingReaction = MayorReaction & { startedAt: number; until: number };
export const reactionPriority: Record<ReactionKind, number> = { subscriber: 2, resubscription: 2, "gift-recipient": 3, gift: 5, follower: 1, neighborhood: 2, raid: 4, bits: 1, donation: 1 };
export const reactionLabels: Record<ReactionKind, string> = { subscriber: "Welcome home!", resubscription: "Welcome back!", "gift-recipient": "A little gift of belonging!", gift: "Gifts for the community!", follower: "Hello, new neighbor!", neighborhood: "A new neighborhood!", raid: "Welcome, visitors!", bits: "Thank you!", donation: "Thank you!" };
const durations: Record<ReactionKind, number> = { subscriber: 3200, resubscription: 4000, "gift-recipient": 3000, gift: 4800, follower: 1800, neighborhood: 3200, raid: 6000, bits: 2500, donation: 2500 };
export function normalizeReaction(cue: ReactionCue): MayorReaction {
  const quantity = cue.kind === "gift" && Number.isSafeInteger(cue.quantity) && cue.quantity! > 0 && cue.quantity! <= 10000 ? cue.quantity : undefined;
  return { id: cue.id, kind: cue.kind, position: { ...cue.position }, expiresAt: cue.expiresAt, ...(quantity ? { quantity } : {}),
    priority: reactionPriority[cue.kind], duration: durations[cue.kind], label: quantity ? `${quantity} gifts for the community!` : reactionLabels[cue.kind],
    particles: cue.kind === "gift" ? "confetti" : cue.kind === "gift-recipient" ? "gift" : cue.kind === "follower" ? "none" : "sparkles" };
}
/** Classification only. Housing reconciliation remains in the event processor. */
export function eventReaction(event: TownEvent, before: TownWorld): { kind: ReactionKind; quantity?: number } | null {
  if ("subscription" in event && event.subscription?.source === "sync") return null;
  const resident = "user" in event ? before.residents.find((r) => r.twitchUserId === event.user.twitchUserId) : undefined;
  if (event.type === "NEW_FOLLOWER") return !resident ? { kind: "follower" } : null;
  if (event.type === "NEW_SUBSCRIBER") return !resident?.isSubscriber ? { kind: event.gift || event.subscription?.isGift ? "gift-recipient" : "subscriber" } : null;
  if (event.type === "RESUBSCRIPTION") return { kind: "resubscription" };
  if (event.type === "GIFT_SUBSCRIPTION" && event.total > 0 && !before.giftGroups.find((g) => g.id === event.groupId)?.announcedCount)
    return { kind: "gift", quantity: event.total };
  return null;
}
export function reactionFromEffect(effect: TownEffect, id = effect.id, expiresAt = effect.expiresAt): MayorReaction | null {
  if (effect.reaction === null) return null;
  const legacy: Partial<Record<TownEffect["kind"], ReactionKind>> = { housewarming: "subscriber", "welcome-back": "resubscription", gift: "gift", neighborhood: "neighborhood" };
  const kind = effect.reaction?.kind ?? legacy[effect.kind];
  return kind ? normalizeReaction({ id, kind, position: effect.position, expiresAt, quantity: effect.reaction?.quantity }) : null;
}
export type ReactionState = { seen: [string, number][]; pending: MayorReaction[]; active: PlayingReaction | null;
  chainStartedAt: number | null; restUntil: number; giftQuietUntil: number; followerQuietUntil: number };
export const emptyReactions = (): ReactionState => ({ seen: [], pending: [], active: null, chainStartedAt: null, restUntil: 0, giftQuietUntil: 0, followerQuietUntil: 0 });
export const MAX_REACTION_QUEUE = 8;
/** Pure per-view state: bounded dedup, priority, gift-only coalescing and a walking break. */
export function advanceReactions(previous: ReactionState | undefined, items: ReactionCue[], now: number): ReactionState {
  const state = previous ?? emptyReactions(), seen = new Map(state.seen.filter(([, until]) => until > now));
  let pending = state.pending.filter((r) => r.expiresAt > now), active = state.active && state.active.until > now ? state.active : null;
  let { chainStartedAt, restUntil, giftQuietUntil, followerQuietUntil } = state;
  for (const cue of items) {
    if (seen.has(cue.id) || cue.expiresAt <= now || seen.size >= 512 || !Object.hasOwn(reactionPriority, cue.kind)) continue;
    seen.set(cue.id, now + 60000);
    const item = normalizeReaction({ ...cue, expiresAt: Math.min(cue.expiresAt, now + 15000) });
    if (item.kind === "gift-recipient" && (giftQuietUntil > now || active?.kind === "gift" || active?.kind === "gift-recipient" || pending.some((r) => r.kind === "gift" || r.kind === "gift-recipient"))) continue;
    if (item.kind === "follower" && (followerQuietUntil > now || active?.kind === "follower" || pending.some((r) => r.kind === "follower"))) continue;
    if (item.kind === "gift") { pending = pending.filter((r) => r.kind !== "gift-recipient"); giftQuietUntil = now + 8000; }
    // Keep one waiting batch per burst; never infer recipient correlation or sum quantities.
    if (item.kind === "gift" && pending.some((r) => r.kind === "gift")) continue;
    pending.push(item);
  }
  pending = pending.sort((a, b) => b.priority - a.priority).slice(0, MAX_REACTION_QUEUE);
  if (chainStartedAt !== null && now - chainStartedAt >= 12000) { active = null; chainStartedAt = null; restUntil = now + 2000; }
  if (now >= restUntil && pending[0] && (!active || pending[0].priority > active.priority)) {
    const next = pending.shift()!;
    active = { ...next, startedAt: now, until: Math.min(next.expiresAt, now + next.duration) };
    chainStartedAt ??= now;
    if (next.kind === "gift-recipient" || next.kind === "gift") giftQuietUntil = now + 8000;
    if (next.kind === "follower") followerQuietUntil = now + 4000;
  }
  if (!active && !pending.length) chainStartedAt = null;
  return { seen: [...seen], pending, active, chainStartedAt, restUntil, giftQuietUntil, followerQuietUntil };
}
export class ReactionQueue {
  private state = emptyReactions();
  private offered: ReactionCue[] = [];
  offer(items: ReactionCue[], now: number) { this.offered = [...this.offered, ...items.filter((r) => r.expiresAt > now)].slice(-512); }
  tick(now: number) { this.state = advanceReactions(this.state, this.offered, now); this.offered = []; return this.state.active; }
  cancel() { this.offered = []; this.state = { ...this.state, pending: [], active: null, chainStartedAt: null }; }
  clear() { this.state = emptyReactions(); this.offered = []; }
}

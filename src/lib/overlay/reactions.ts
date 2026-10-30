import type { TownEffect, WorldPosition } from "../simulation/types";
export type ReactionKind = "subscriber" | "resubscription" | "gift" | "raid" | "bits" | "donation" | "neighborhood";
export type OverlayReaction = { id: string; kind: ReactionKind; position: WorldPosition; expiresAt: number };
export const reactionPriority: Record<ReactionKind, number> = { subscriber: 2, resubscription: 2, gift: 3, raid: 4, bits: 1, donation: 1, neighborhood: 2 };
export const reactionLabels: Record<ReactionKind, string> = { subscriber: "Welcome home!", resubscription: "Welcome back!", gift: "A gift for the community!", raid: "Welcome, visitors!", bits: "Thank you!", donation: "Thank you!", neighborhood: "A new neighborhood!" };
export function reactionFromEffect(effect: TownEffect, id: string, expiresAt: number): OverlayReaction | null {
  const implemented: Partial<Record<TownEffect["kind"], ReactionKind>> = { housewarming: "subscriber", "welcome-back": "resubscription", gift: "gift", neighborhood: "neighborhood" };
  const kind = implemented[effect.kind];
  return kind ? { id, kind, position: effect.position, expiresAt } : null;
}
/** Higher priority interrupts; equal/lower priority waits. Expired work is discarded.
 * Bounded dedupe survives polls; interrupted reactions are not replayed. */
export class ReactionQueue {
  private seen = new Set<string>();
  private pending: OverlayReaction[] = [];
  private active: (OverlayReaction & { until: number }) | null = null;
  offer(items: OverlayReaction[], now: number) {
    for (const item of items) if (!this.seen.has(item.id)) {
      this.seen.add(item.id);
      if (item.expiresAt > now) this.pending.push(item);
    }
    while (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    this.pending = this.pending.filter((r) => r.expiresAt > now).sort((a, b) => reactionPriority[b.kind] - reactionPriority[a.kind]).slice(0, 32);
  }
  tick(now: number) {
    this.pending = this.pending.filter((r) => r.expiresAt > now);
    if (this.active && this.active.until <= now) this.active = null;
    if (this.pending[0] && (!this.active || reactionPriority[this.pending[0].kind] > reactionPriority[this.active.kind])) {
      const next = this.pending.shift()!; this.active = { ...next, until: Math.min(next.expiresAt, now + 6000) };
    }
    return this.active;
  }
  cancel() { this.pending = []; this.active = null; }
  clear() { this.seen.clear(); this.cancel(); }
}

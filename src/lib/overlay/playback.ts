import { createSession } from "../simulation/world";
import { tickTown } from "../simulation/engine";
import { calculateActivity } from "../simulation/activity";
import type { TownSession } from "../simulation/types";
import type { OverlaySnapshot } from "./service";
import { defaultDisplay } from "./model";
import { normalizeReaction } from "../mayor/reactions";
import { PresentationCursor } from "../simulation/presentation-cursor";
import { reconcileResidentSources, type ResidentSource } from "../simulation/residents";
import { HOUSEWARMING_MS } from "../rendering/housewarming";

/** Presentation only: never processes durable events or generates a replacement town. */
export class OverlayPlayback {
  session: TownSession | null = null;
  revision: number | null = null;
  settings = defaultDisplay;
  private cursor = new PresentationCursor();
  private homeCursor = new PresentationCursor();
  private reactionId: string | null = null;
  private populationEpoch: string | null = null;
  private populationSources: ResidentSource[] = [];
  constructor(readonly townId: string) {}
  receive(snapshot: OverlaySnapshot, now: number) {
    if (snapshot.townId !== this.townId || snapshot.world && snapshot.world.id !== this.townId) throw new Error("Overlay town mismatch");
    if (snapshot.world) {
      this.session = this.session ? { ...this.session, world: snapshot.world } : createSession(snapshot.world, now);
    }
    if (!this.session) throw new Error("Overlay world missing");
    if (snapshot.population) {
      const sameEpoch = this.populationEpoch === snapshot.population.epoch;
      this.session.runtime.residentActors = reconcileResidentSources(this.session.world, now, snapshot.population.actors,
        sameEpoch ? this.session.runtime.residentActors : [],
        sameEpoch ? new Set(this.populationSources.map((source) => source.id)) : undefined);
      this.populationEpoch = snapshot.population.epoch;
      this.populationSources = snapshot.population.actors;
    }
    this.revision = snapshot.revision; this.settings = snapshot.settings;
    const samples = snapshot.activity.sampleAgesMs.filter((age) => Number.isFinite(age) && age >= 0 && age < 60000).slice(-2000)
      .map((age, i) => ({ userId: `activity-${i}`, message: "", at: now - age }));
    this.session.runtime.activity = calculateActivity(samples, now);
    this.session.runtime.effects = [...this.session.runtime.effects,
      ...this.homeCursor.take(snapshot.housewarmings ?? [], now).map((cue) => ({ ...cue, reaction: null, startedAt: now, expiresAt: now + HOUSEWARMING_MS })),
      ...this.cursor.take(snapshot.reactions, now).map((cue) => {
      const reaction = normalizeReaction(cue);
      return { id: cue.id, kind: "gift" as const, position: cue.position, startedAt: now, expiresAt: cue.expiresAt,
        label: reaction.label, reaction: { kind: cue.kind, quantity: reaction.quantity } };
    })].slice(-32);
  }
  tick(now: number) {
    if (!this.session) return null;
    this.session = tickTown(this.session, now);
    const reaction = this.session.runtime.reactionPlayback?.active;
    const changed = (reaction?.id ?? null) !== this.reactionId;
    if (changed) {
      this.reactionId = reaction?.id ?? null;
    }
    const homes = this.session.runtime.effects.filter((effect) => effect.housewarming);
    this.session.runtime.effects = [...homes, ...(reaction ? [{ id: reaction.id, kind: "gift" as const, position: this.session.runtime.mayor.position,
      label: reaction.label, startedAt: reaction.startedAt, expiresAt: reaction.until, reaction: { kind: reaction.kind, quantity: reaction.quantity } }] : [])];
    return changed && reaction ? { ...reaction, position: this.session.runtime.mayor.position } : null;
  }
  unavailable() {
    // No artificial messages on an outage; existing activity decays naturally.
    this.reactionId = null;
    if (this.session) {
      this.session.runtime.effects = []; this.session.runtime.mayor.celebrationUntil = 0; this.session.runtime.mayor.behavior = "idle";
      const state = this.session.runtime.reactionPlayback;
      if (state) this.session.runtime.reactionPlayback = { ...state, active: null, pending: [], chainStartedAt: null };
    }
  }
  clear() { this.unavailable(); this.cursor.clear(); this.homeCursor.clear(); this.session = null; this.revision = null; this.populationEpoch = null; this.populationSources = []; }
}

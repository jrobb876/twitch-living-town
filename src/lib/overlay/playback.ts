import { createSession } from "../simulation/world";
import { tickTown } from "../simulation/engine";
import { calculateActivity } from "../simulation/activity";
import type { TownSession } from "../simulation/types";
import type { OverlaySnapshot } from "./service";
import { defaultDisplay } from "./model";
import { ReactionQueue, reactionLabels } from "./reactions";
import { PresentationCursor } from "../simulation/presentation-cursor";
import { reconcileResidentSources, type ResidentSource } from "../simulation/residents";

/** Presentation only: never processes durable events or generates a replacement town. */
export class OverlayPlayback {
  session: TownSession | null = null;
  revision: number | null = null;
  settings = defaultDisplay;
  private queue = new ReactionQueue();
  private cursor = new PresentationCursor();
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
    this.queue.offer(this.cursor.take(snapshot.reactions, now), now);
  }
  tick(now: number) {
    if (!this.session) return null;
    this.session = tickTown(this.session, now);
    const reaction = this.queue.tick(now);
    const changed = (reaction?.id ?? null) !== this.reactionId;
    if (changed) {
      this.reactionId = reaction?.id ?? null;
      this.session.runtime.effects = reaction ? [{ id: reaction.id, kind: "gift", position: reaction.position,
        label: reactionLabels[reaction.kind], startedAt: now, expiresAt: reaction.until }] : [];
      this.session.runtime.mayor.celebrationUntil = reaction?.until ?? 0;
      this.session.runtime.mayor.behavior = reaction ? "celebrating" : "idle";
    }
    return changed && reaction ? reaction : null;
  }
  unavailable() {
    // No artificial messages on an outage; existing activity decays naturally.
    this.queue.cancel(); this.reactionId = null;
    if (this.session) { this.session.runtime.effects = []; this.session.runtime.mayor.celebrationUntil = 0; }
  }
  clear() { this.unavailable(); this.queue.clear(); this.cursor.clear(); this.session = null; this.revision = null; this.populationEpoch = null; this.populationSources = []; }
}

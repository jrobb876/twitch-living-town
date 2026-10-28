import { createHmac, randomBytes } from "node:crypto";
import { calculateActivity, normalizeChatMessage } from "../simulation/activity";
import { processEvent, tickTown } from "../simulation/engine";
import { createSession, createWorld } from "../simulation/world";
import { mapChatNotification } from "./mapping";
import { liveTownId } from "./types";
import { chatDiagnostic } from "./diagnostics";

/** The existing event processor is authoritative. Only its activity projection leaves the server. */
export class LiveChatFeed {
  private state;
  private seen = new Map<string, number>();
  private contentKey = randomBytes(32);
  lastEventAt: number | null = null;
  receivedMessages = 0;
  constructor(readonly broadcasterId: string, now: number) {
    this.state = createSession(createWorld({ id: liveTownId(broadcasterId), streamerTwitchUserId: broadcasterId,
      seed: 20261027, name: "Live town", mayorName: "Mayor" }), now);
  }
  private prune(now: number) {
    for (const [id, at] of this.seen) if (now - at >= 10 * 60_000) this.seen.delete(id);
  }
  receive(notification: unknown, now: number) {
    const event = mapChatNotification(notification, this.broadcasterId, now, (reason) => chatDiagnostic("notification", "rejected", { reason }));
    if (!event) return false;
    this.prune(now);
    if (this.seen.has(event.id) || this.seen.size >= 10_000) {
      chatDiagnostic("event_processor", "ignored", { reason: this.seen.has(event.id) ? "duplicate_message" : "dedup_capacity" });
      return false;
    }
    // Match the existing duplicate-text rules without retaining readable chat.
    event.message = createHmac("sha256", this.contentKey).update(normalizeChatMessage(event.message)).digest("hex");
    const result = processEvent(this.state, event, Math.max(now, this.state.runtime.now));
    if (result.outcome.status !== "applied") {
      chatDiagnostic("event_processor", "rejected", { reason: result.outcome.status === "duplicate" ? "processor_duplicate" : "processor_rejected" });
      return false;
    }
    const before = calculateActivity(this.state.runtime.activity.samples, now).samples.length;
    const activityAwarded = result.state.runtime.activity.samples.length > before;
    this.state = result.state;
    this.state.world.processedEvents = this.state.world.processedEvents.slice(-1000);
    this.state.runtime.activity.samples = this.state.runtime.activity.samples.slice(-2000);
    this.seen.set(event.id, now); this.lastEventAt = now; this.receivedMessages++;
    chatDiagnostic("event_processor", "accepted", { receivedMessages: this.receivedMessages, activityAwarded });
    return true;
  }
  snapshot(now: number) {
    this.prune(now);
    this.state = tickTown(this.state, now);
    return { lastEventAt: this.lastEventAt, receivedMessages: this.receivedMessages,
      sampleAgesMs: calculateActivity(this.state.runtime.activity.samples, now).samples.map((sample) => now - sample.at) };
  }
}

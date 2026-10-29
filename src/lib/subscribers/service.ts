import { randomUUID } from "node:crypto";
import type { AuthService } from "../auth/service";
import { SUBSCRIPTION_SCOPE, AuthError, isAuthError, type AccountProfile } from "../auth/types";
import type { TownPersistenceService } from "../persistence/service";
import type { DurableEvent } from "../persistence/types";
import type { SubscriberSync, SubscriptionEvidence } from "../simulation/types";
import { housesIn } from "../simulation/world";
import { TwitchSubscriptions } from "./twitch";
import { HousingError, housingCode, type HousingCode, type VerifiedSubscriber, type HousingPresentation } from "./types";
import { mapHousingNotification, type HousingNotification } from "./mapping";

type Grant = { profile: AccountProfile; key: string };
type Pending = Grant & { notification: HousingNotification; attempts: number; due: number };
export class SubscriberHousingService {
  private jobs = new Map<string, Promise<void>>();
  private jobStatus = new Map<string, SubscriberSync>();
  private queues = new Map<string, Pending[]>();
  private processing = new Set<string>();
  private errors = new Map<string, HousingCode>();
  private presentations = new Map<string, HousingPresentation[]>();
  constructor(private auth: AuthService, private persistence: () => TownPersistenceService,
    private twitch = new TwitchSubscriptions(auth.config.clientId), private now = Date.now) {}
  async grant(sessionId: string | undefined, force = false) {
    const grant = await this.auth.scopedSession(sessionId, force);
    if (!grant.scopes.includes(SUBSCRIPTION_SCOPE)) throw new AuthError("subscription_scope");
    if (!await this.persistence().mine(grant.profile)) throw new HousingError("not_found");
    return grant;
  }
  private active(grant: Grant) {
    if (!this.auth.scopedSessionActive(grant.key, [SUBSCRIPTION_SCOPE])) throw new AuthError("subscription_scope");
  }
  private async page(grant: Grant, cursor?: string, userId?: string) {
    const credentials = await this.auth.scopedCredentials(grant.key, [SUBSCRIPTION_SCOPE]);
    try { return await this.twitch.page(credentials.accessToken, grant.profile.twitchUserId, cursor, userId); }
    catch (error) { if (isAuthError(error) && error.code === "invalid_token") this.auth.revokeChat(grant.key); throw error; }
  }
  async startSync(grant: Grant) {
    this.active(grant);
    const id = grant.profile.twitchUserId;
    if (this.jobs.has(id)) throw new HousingError("busy");
    const town = await this.persistence().mine(grant.profile);
    if (!town) throw new HousingError("not_found");
    // Reserve synchronously after the read, before any further await.
    if (this.jobs.has(id)) throw new HousingError("busy");
    const summary: SubscriberSync = { id: randomUUID(), status: "running", startedAt: this.now(), finishedAt: null,
      imported: 0, updated: 0, unchanged: 0, waitlisted: 0, failed: 0, pages: 0, error: null };
    this.jobStatus.set(id, summary);
    const job = this.synchronize(grant, town.world.id, summary).catch(() => { summary.status = "failed"; summary.error = "unavailable"; summary.finishedAt = this.now(); }).finally(() => { this.jobs.delete(id); });
    this.jobs.set(id, job);
    return { ...summary };
  }
  async waitForSync(userId: string) { await this.jobs.get(userId); }
  private evidence(user: VerifiedSubscriber, source: "sync" | "eventsub", at: number, active = true): SubscriptionEvidence {
    return { active, tier: user.tier, isGift: user.isGift, source, verifiedAt: at };
  }
  private async synchronize(grant: Grant, townId: string, summary: SubscriberSync) {
    const persistence = this.persistence(), seen = new Set<string>(), cursors = new Set<string>();
    let cursor: string | undefined;
    try {
      await persistence.saveSync(grant.profile, townId, summary);
      do {
        this.active(grant);
        if (summary.pages >= 500 || seen.size >= 10000 || this.now() - summary.startedAt > 10 * 60000) throw new HousingError("capacity");
        const page = await this.page(grant, cursor); summary.pages++;
        const verifiedAt = this.now();
        let current = await persistence.owned(grant.profile, townId);
        for (const user of page.subscribers) {
          if (seen.has(user.twitchUserId)) continue;
          seen.add(user.twitchUserId); this.active(grant);
          try {
            const prior = current.world.residents.find((r) => r.twitchUserId === user.twitchUserId);
            const same = prior?.isSubscriber && prior.displayName === user.displayName && prior.subscription?.tier === user.tier && prior.subscription?.isGift === user.isGift;
            const result = await persistence.applyVerifiedEvent({ source: "twitch_verified", event: { id: `sync:${summary.id}:${user.twitchUserId}`, type: "NEW_SUBSCRIBER",
              townId, occurredAt: verifiedAt, user: { twitchUserId: user.twitchUserId, displayName: user.displayName }, subscription: this.evidence(user, "sync", verifiedAt) } });
            current = result.town;
            if (result.expansionDeferred) summary.error = "expansion_deferred";
            const neighborhoods = result.presentation?.effects.filter((effect) => effect.kind === "neighborhood") ?? [];
            if (neighborhoods.length) this.presentations.set(grant.profile.twitchUserId, [...(this.presentations.get(grant.profile.twitchUserId) ?? []),
              { id: `expansion:${summary.id}:${user.twitchUserId}`, townId, expiresAt: this.now() + 15000, effects: neighborhoods,
                tasks: result.presentation!.tasks.filter((task) => task.nodeId.startsWith("neighborhood-") && task.kind === "welcome") }].slice(-32));
            if (!prior) summary.imported++; else if (same) summary.unchanged++; else summary.updated++;
            if (result.town.world.residents.find((r) => r.twitchUserId === user.twitchUserId)?.housingStatus === "waiting") summary.waitlisted++;
          } catch { summary.failed++; summary.error = "unavailable"; }
        }
        await persistence.saveSync(grant.profile, townId, summary);
        cursor = page.cursor;
        if (cursor && (cursors.has(cursor) || !page.subscribers.length)) throw new HousingError("invalid_response");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      // Absence from a paginated list alone is not proof. Recheck each missing active subscriber directly.
      if (!summary.failed) {
        const town = await persistence.owned(grant.profile, townId);
        for (const resident of town.world.residents.filter((r) => r.isSubscriber && !seen.has(r.twitchUserId))) {
          if (this.now() - summary.startedAt > 10 * 60000) throw new HousingError("capacity");
          this.active(grant);
          const verified = await this.page(grant, undefined, resident.twitchUserId);
          if (verified.subscribers.length) continue;
          const at = this.now();
          await persistence.applyVerifiedEvent({ source: "twitch_verified", event: { type: "SUBSCRIPTION_ENDED", id: `sync:${summary.id}:end:${resident.twitchUserId}`,
            townId, occurredAt: at, user: { twitchUserId: resident.twitchUserId, displayName: resident.displayName },
            subscription: { active: false, tier: resident.subscription?.tier ?? "1000", isGift: resident.subscription?.isGift ?? false, source: "sync", verifiedAt: at } } });
          summary.updated++;
        }
      }
      if (summary.waitlisted && !summary.error) summary.error = "capacity";
      summary.status = summary.failed || summary.error === "expansion_deferred" || summary.waitlisted ? "partial" : "complete";
    } catch (error) {
      summary.status = summary.pages || summary.imported || summary.updated ? "partial" : "failed";
      summary.error = housingCode(error);
    } finally {
      summary.finishedAt = this.now();
      try { await persistence.saveSync(grant.profile, townId, summary); }
      catch { summary.status = "failed"; summary.error = "unavailable"; }
    }
  }
  enqueue(profile: AccountProfile, key: string, value: unknown) {
    const notification = mapHousingNotification(value, profile.twitchUserId, this.now());
    if (!notification) { console.info(JSON.stringify({ event: "twitch_housing", operation: "notification", outcome: "rejected", reason: "invalid_payload" })); return; }
    const queue = this.queues.get(profile.twitchUserId) ?? [];
    if (queue.some((item) => item.notification.id === notification.id)) return;
    if (queue.length >= 1000) { this.errors.set(profile.twitchUserId, "capacity"); return; }
    queue.push({ profile, key, notification, attempts: 0, due: 0 }); this.queues.set(profile.twitchUserId, queue);
    void this.pump(profile.twitchUserId);
  }
  tick() {
    for (const id of this.queues.keys()) void this.pump(id);
    for (const [id, items] of this.presentations) {
      const current = items.filter((item) => item.expiresAt > this.now());
      if (current.length) this.presentations.set(id, current); else this.presentations.delete(id);
    }
  }
  private async pump(userId: string) {
    if (this.processing.has(userId)) return;
    const queue = this.queues.get(userId), item = queue?.[0]; if (!item || item.due > this.now()) return;
    this.processing.add(userId);
    try {
      this.active(item); await this.applyNotification(item);
      queue!.shift(); this.errors.delete(userId);
      console.info(JSON.stringify({ event: "twitch_housing", operation: "notification", outcome: "processed" }));
    } catch (error) {
      this.errors.set(userId, housingCode(error)); item.attempts++;
      if (item.attempts >= 8 || !this.auth.scopedSessionActive(item.key, [SUBSCRIPTION_SCOPE])) queue!.shift();
      else item.due = this.now() + Math.min(60000, 1000 * 2 ** item.attempts);
      console.warn(JSON.stringify({ event: "twitch_housing", operation: "notification", outcome: "failed", category: housingCode(error) }));
    } finally {
      this.processing.delete(userId);
      if (!queue?.length) this.queues.delete(userId);
      else if (queue[0].due <= this.now()) void this.pump(userId);
    }
  }
  private async applyNotification(item: Pending) {
    const persistence = this.persistence(), town = await persistence.mine(item.profile), n = item.notification;
    if (!town) throw new HousingError("not_found");
    let event: DurableEvent;
    if (n.type === "channel.subscription.gift") {
      event = { id: n.id, type: "GIFT_SUBSCRIPTION", townId: town.world.id, occurredAt: n.occurredAt, groupId: n.id,
        gifter: n.user ? { twitchUserId: n.user.twitchUserId, displayName: n.user.displayName } : null, total: n.total, recipients: [] };
    } else {
      let user = n.user!;
      if (n.type === "channel.subscription.message") {
        const verified = await this.page(item, undefined, user.twitchUserId);
        if (!verified.subscribers.length) return; // Sharing a resub message does not prove current membership.
        user = verified.subscribers[0];
      }
      const base = { id: n.id, townId: town.world.id, occurredAt: n.occurredAt, user: { twitchUserId: user.twitchUserId, displayName: user.displayName },
        subscription: this.evidence(user, "eventsub", n.occurredAt, n.type !== "channel.subscription.end") };
      event = n.type === "channel.subscription.end" ? { ...base, type: "SUBSCRIPTION_ENDED" }
        : n.type === "channel.subscription.message" ? { ...base, type: "RESUBSCRIPTION", cumulativeMonths: n.months! } : { ...base, type: "NEW_SUBSCRIBER" };
    }
    this.active(item);
    const result = await persistence.applyVerifiedEvent({ source: "twitch_verified", event });
    if (result.status === "saved" && result.presentation?.effects.length) {
      this.presentations.set(item.profile.twitchUserId, [...(this.presentations.get(item.profile.twitchUserId) ?? []),
        { id: n.id, townId: town.world.id, expiresAt: this.now() + 15000, ...result.presentation }].slice(-32));
    }
    if (n.type === "channel.subscription.gift" && result.status === "saved" && !this.jobs.has(item.profile.twitchUserId)) {
      // API records identify recipients; Twitch exposes no exact gift-batch correlation ID.
      await this.startSync(item);
    }
  }
  async status(profile: AccountProfile) {
    const town = await this.persistence().mine(profile), houses = town ? housesIn(town.world) : [];
    const persisted = town?.world.subscriberSync ?? null, local = this.jobStatus.get(profile.twitchUserId);
    const lastSync = local && (!persisted || local.startedAt >= persisted.startedAt) ? { ...local } : persisted;
    if (lastSync?.status === "running" && !this.jobs.has(profile.twitchUserId)) { lastSync.status = "partial"; lastSync.error = "unavailable"; } // Interrupted process, never claim complete.
    return { hasTown: !!town, lastSync, revision: town?.revision ?? null,
      active: houses.filter((h) => h.ownerTwitchUserId && h.property?.status !== "legacy").length,
      legacy: houses.filter((h) => h.property?.status === "legacy").length, verifiedHouses: houses.filter((h) => h.ownerTwitchUserId).length,
      availablePlots: town ? town.world.plots.length - houses.filter((h) => h.ownerTwitchUserId).length : 0,
      waitlisted: town?.world.residents.filter((r) => r.isSubscriber && r.housingStatus === "waiting").length ?? 0,
      deliveryError: this.errors.get(profile.twitchUserId) ?? null, pendingEvents: this.queues.get(profile.twitchUserId)?.length ?? 0,
      presentations: (this.presentations.get(profile.twitchUserId) ?? []).filter((item) => item.expiresAt > this.now()) };
  }
}

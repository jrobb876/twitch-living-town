import { randomUUID } from "node:crypto";
import type { AuthService } from "../auth/service";
import { AuthError, FOLLOWER_SCOPE, SUBSCRIPTION_SCOPE, type AccountProfile } from "../auth/types";
import type { TownPersistenceService } from "../persistence/service";
import { PersistenceError } from "../persistence/types";
import type { SubscriberHousingService } from "../subscribers/service";
import { HousingError, housingCode } from "../subscribers/types";
import { IMPORT_LEASE_MS, communityMessages, type CommunityImport } from "./types";
import { TwitchFollowers } from "./twitch";
import { mapFollowNotification } from "./mapping";

type Grant = { key: string; profile: AccountProfile };
type Pending = Grant & { event: NonNullable<ReturnType<typeof mapFollowNotification>>; attempts: number; due: number };
export function communityCode(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code && (Object.hasOwn(communityMessages, code) || ["follower_scope", "subscription_scope", "invalid_token"].includes(code)) ? code : "unavailable";
}
export class CommunityImportService {
  private jobs = new Map<string, Promise<void>>();
  private writeFailures = new Set<string>();
  private queue: Pending[] = [];
  private pumping = false;
  private deliveryErrors = new Map<string, string>();
  constructor(private auth: AuthService, private persistence: () => TownPersistenceService, private housing: SubscriberHousingService,
    private twitch = new TwitchFollowers(auth.config.clientId), private now = Date.now) {}
  private active(grant: Grant) {
    if (!this.auth.scopedSessionActive(grant.key, [FOLLOWER_SCOPE])) throw new AuthError("follower_scope");
  }
  async start(grant: Grant) {
    this.active(grant);
    const owner = grant.profile.twitchUserId;
    if (this.jobs.has(owner)) throw new HousingError("busy");
    if (this.jobs.size >= 100) throw new HousingError("capacity");
    const persistence = this.persistence(), town = await persistence.mine(grant.profile);
    if (!town) throw new HousingError("not_found");
    const summary: CommunityImport = { id: randomUUID(), status: "running", phase: "followers", startedAt: this.now(), updatedAt: this.now(),
      leaseUntil: this.now() + IMPORT_LEASE_MS, finishedAt: null, followersDiscovered: 0, subscribersDiscovered: 0,
      uniqueResidentsImported: 0, subscriberHousesAssigned: 0, pages: 0, error: null };
    // CAS claim is persisted before work starts; separate tabs/processes cannot own the same lease.
    await persistence.saveCommunityImport(grant.profile, town.world.id, summary, this.now(), true);
    this.writeFailures.delete(owner);
    const job = this.run(grant, town.world.id, summary).finally(() => { this.jobs.delete(owner); });
    this.jobs.set(owner, job);
    return summary;
  }
  async waitForImport(owner: string) { await this.jobs.get(owner); }
  private async run(grant: Grant, townId: string, summary: CommunityImport) {
    const persistence = this.persistence(), seen = new Set<string>(), unique = new Set<string>(), cursors = new Set<string>();
    const checkpoint = async () => {
      this.active(grant);
      if (this.now() - summary.startedAt > 10 * 60000) throw new HousingError("capacity");
      summary.updatedAt = this.now(); summary.leaseUntil = this.now() + IMPORT_LEASE_MS;
      await persistence.saveCommunityImport(grant.profile, townId, summary, this.now());
    };
    try {
      let cursor: string | undefined, minimumTotal = Infinity;
      do {
        await checkpoint();
        if (summary.pages >= 500) throw new HousingError("capacity");
        const credentials = await this.auth.scopedCredentials(grant.key, [FOLLOWER_SCOPE]);
        const page = await this.twitch.page(credentials.accessToken, grant.profile.twitchUserId, cursor);
        summary.pages++; minimumTotal = Math.min(minimumTotal, page.total);
        for (const user of page.followers) {
          if (seen.has(user.twitchUserId)) continue;
          if (seen.size >= 10000) throw new HousingError("capacity");
          this.active(grant); seen.add(user.twitchUserId); summary.followersDiscovered = seen.size;
          await persistence.applyVerifiedEvent({ source: "twitch_verified", historical: true, event: { type: "NEW_FOLLOWER",
            id: `community-follow:${user.twitchUserId}`, townId, occurredAt: this.now(), user } });
          unique.add(user.twitchUserId); summary.uniqueResidentsImported = unique.size;
          if (seen.size % 20 === 0) await checkpoint();
        }
        await checkpoint(); cursor = page.cursor;
        if (cursor && (cursors.has(cursor) || !page.followers.length)) throw new HousingError("invalid_response");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      if (seen.size < minimumTotal) throw new HousingError("invalid_response");
      summary.phase = "subscribers"; await checkpoint();
      if (!this.auth.scopedSessionActive(grant.key, [SUBSCRIPTION_SCOPE])) throw new AuthError("subscription_scope");
      const sync = await this.housing.startSync(grant, { historical: true, onProgress: checkpoint, onDiscovered: () => { summary.subscribersDiscovered++; }, onRecord: async (user, result) => {
        unique.add(user.twitchUserId); summary.uniqueResidentsImported = unique.size;
        if (result.status === "saved") summary.subscriberHousesAssigned += result.outcome?.houseIds.length ?? 0;
        if (summary.subscribersDiscovered % 20 === 0) await checkpoint();
      } });
      await this.housing.waitForSync(grant.profile.twitchUserId);
      const status = await this.housing.status(grant.profile);
      if (status.lastSync?.id !== sync.id || status.lastSync.status !== "complete") {
        throw new HousingError(housingCode({ code: status.lastSync?.error }));
      }
      summary.status = "complete"; summary.phase = "finished";
    } catch (error) {
      summary.status = summary.uniqueResidentsImported || summary.pages ? "partial" : "failed"; summary.error = communityCode(error);
    }
    summary.updatedAt = this.now(); summary.finishedAt = this.now(); summary.leaseUntil = this.now();
    try { await persistence.saveCommunityImport(grant.profile, townId, summary, this.now()); }
    catch {
      // Never present unpersisted completion. The last durable checkpoint stays running until its lease expires.
      if (this.writeFailures.size >= 100) this.writeFailures.delete(this.writeFailures.values().next().value!);
      this.writeFailures.add(grant.profile.twitchUserId);
    }
  }
  async status(profile: AccountProfile) {
    const town = await this.persistence().mine(profile), saved = town?.world.communityImport;
    const summary = saved ? { ...saved } : null;
    if (summary?.status === "running" && (summary.leaseUntil <= this.now() || !this.jobs.has(profile.twitchUserId))) {
      summary.status = "partial"; summary.error = "interrupted";
    }
    return { hasTown: !!town, summary, revision: town?.revision ?? null,
      retryAt: saved?.status === "running" ? saved.leaseUntil : 0,
      persistenceError: this.writeFailures.has(profile.twitchUserId),
      pendingEvents: this.queue.filter((p) => p.profile.twitchUserId === profile.twitchUserId).length,
      deliveryError: this.deliveryErrors.get(profile.twitchUserId) ?? null };
  }
  enqueue(profile: AccountProfile, key: string, value: unknown) {
    const event = mapFollowNotification(value, profile.twitchUserId, this.now());
    if (!event) return;
    if (this.queue.some((p) => p.profile.twitchUserId === profile.twitchUserId && p.event.id === event.id)) return;
    if (this.queue.length >= 1000) { this.setDeliveryError(profile.twitchUserId, "capacity"); return; }
    this.queue.push({ profile, key, event, attempts: 0, due: 0 }); void this.pump();
  }
  tick() { void this.pump(); }
  private setDeliveryError(owner: string, code: string) {
    if (this.deliveryErrors.size >= 100 && !this.deliveryErrors.has(owner)) this.deliveryErrors.delete(this.deliveryErrors.keys().next().value!);
    this.deliveryErrors.set(owner, code);
  }
  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      // One bounded queue across channels. Failed deliveries do not block another channel.
      for (const item of [...this.queue].filter((p) => p.due <= this.now()).slice(0, 100)) {
        try {
          this.active(item);
          const persistence = this.persistence(), town = await persistence.mine(item.profile);
          if (!town) throw new PersistenceError("not_found");
          this.active(item);
          const result = await persistence.applyVerifiedEvent({ source: "twitch_verified", event: { ...item.event, type: "NEW_FOLLOWER", townId: town.world.id } });
          if (result.status === "saved" && result.presentation?.effects.length) this.housing.present(item.profile.twitchUserId,
            { id: item.event.id, townId: town.world.id, expiresAt: this.now() + 15000, ...result.presentation });
          this.queue.splice(this.queue.indexOf(item), 1); this.deliveryErrors.delete(item.profile.twitchUserId);
        } catch (error) {
          this.setDeliveryError(item.profile.twitchUserId, communityCode(error)); item.attempts++;
          if (item.attempts >= 8 || !this.auth.scopedSessionActive(item.key, [FOLLOWER_SCOPE])) this.queue.splice(this.queue.indexOf(item), 1);
          else item.due = this.now() + Math.min(60000, 1000 * 2 ** item.attempts);
        }
      }
    } finally { this.pumping = false; }
  }
}

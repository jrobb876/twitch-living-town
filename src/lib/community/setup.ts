import type { AuthService } from "../auth/service";
import { AuthError } from "../auth/types";
import type { TownPersistenceService } from "../persistence/service";
import { PersistenceError } from "../persistence/types";
import type { SubscriberHousingService } from "../subscribers/service";
import type { ChatManager } from "../chat/manager";
import { communityCode, type CommunityImportService } from "./service";
import { features, featureScopes, type Selection, type SetupStatus, type Feature } from "./setup-model";

export class CommunitySetup {
  private running = new Set<string>();
  constructor(private auth: AuthService, private persistence: () => Pick<TownPersistenceService, "mine">,
    private community: Pick<CommunityImportService, "status" | "start">,
    private housing: Pick<SubscriberHousingService, "status" | "startSync">,
    private chat: Pick<ChatManager, "snapshot" | "followerStatus" | "housingStatus" | "start">) {}
  async status(id: string): Promise<SetupStatus> {
    const grant = await this.auth.scopedSession(id), town = await this.persistence().mine(grant.profile);
    if (!town) throw new PersistenceError("not_found");
    if (town.world.streamerTwitchUserId !== grant.profile.twitchUserId) throw new AuthError("forbidden");
    const [community, housing, chat] = await Promise.all([this.community.status(grant.profile), this.housing.status(grant.profile), this.chat.snapshot(id)]);
    const follow = this.chat.followerStatus(grant.profile.twitchUserId), sub = this.chat.housingStatus(grant.profile.twitchUserId);
    return { townId: town.world.id, csrfToken: this.auth.csrfToken(id),
      permissions: { followers: grant.scopes.includes(featureScopes.followers), subscribers: grant.scopes.includes(featureScopes.subscribers), chat: grant.scopes.includes(featureScopes.chat) },
      imports: {
        followers: { status: community.persistenceError ? "failed" : community.summary?.status ?? "not_started", error: community.persistenceError ? "unavailable" : community.summary?.error ?? null,
          count: community.summary?.followersDiscovered ?? 0, retryAt: community.retryAt },
        subscribers: { status: housing.lastSync?.status ?? "not_started", error: housing.lastSync?.error ?? null,
          count: housing.lastSync ? housing.lastSync.imported + housing.lastSync.updated + housing.lastSync.unchanged : 0, retryAt: 0 },
      },
      live: { followers: { status: follow.live, ready: follow.liveReady, error: community.deliveryError },
        subscribers: { status: sub.live, ready: sub.liveReady, error: housing.deliveryError },
        chat: { status: chat.status, ready: chat.subscriptionReady, error: null } },
    };
  }
  async connect(id: string, townId: string, selected: Selection) {
    const grant = await this.auth.scopedSession(id, true);
    // Acquire before the first asynchronous town read. Other tabs cannot start
    // overlapping setup operations. Existing jobs retain their durable CAS leases.
    if (this.running.has(grant.profile.twitchUserId)) return { busy: true, errors: {} };
    if (this.running.size >= 100) throw new AuthError("capacity");
    this.running.add(grant.profile.twitchUserId);
    try {
      const status = await this.status(id);
      if (status.townId !== townId) throw new AuthError("forbidden");
      const errors: Partial<Record<Feature, string>> = {};
      const eligible: Feature[] = [];
      for (const feature of features.filter((f) => selected[f])) {
        if (!status.permissions[feature]) { errors[feature] = "permission_required"; continue; }
        eligible.push(feature);
        // Import failures must not prevent eligible listeners or other features.
        try {
          if (feature === "followers" && !["complete", "running"].includes(status.imports.followers.status)) {
            if (status.imports.followers.retryAt > Date.now()) errors.followers = "busy";
            else await this.community.start(grant, { includeSubscribers: false });
          }
          if (feature === "subscribers" && !["complete", "running"].includes(status.imports.subscribers.status))
            await this.housing.startSync(grant, { historical: true });
        } catch (error) { errors[feature] = communityCode(error); }
      }
      // One shared socket/subscription reconciliation, not three successive
      // disconnect/reconnect cycles for one setup click.
      if (eligible.length) try { await this.chat.start(id, eligible.map((feature) => feature === "subscribers" ? "housing" : feature === "followers" ? "followers" : "chat")); }
      catch (error) { for (const feature of eligible) errors[feature] = communityCode(error); }
      return { busy: false, errors };
    } finally { this.running.delete(grant.profile.twitchUserId); }
  }
}

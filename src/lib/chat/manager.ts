import { AuthError, CHAT_SCOPE, SUBSCRIPTION_SCOPE, FOLLOWER_SCOPE, type AccountProfile } from "../auth/types";
import type { AuthService } from "../auth/service";
import { EventSubConnection, nodeSocket, type SocketFactory } from "./eventsub";
import { LiveChatFeed } from "./feed";
import { subscribeToEvent, type EventSubType } from "./subscription";
import { SUBSCRIPTION_EVENTS } from "../subscribers/types";
import { record } from "./mapping";
import { liveTownId, type ChatSnapshot } from "./types";

type Entry = { key: string; connection: EventSubConnection; feed: LiveChatFeed; touchedAt: number; chat: boolean; housing: boolean; followers: boolean };
type ConnectionKind = "chat" | "housing" | "followers";
export type HousingHook = { enqueue: (profile: AccountProfile, key: string, value: unknown) => void; tick: () => void };
export class ChatManager {
  private entries = new Map<string, Entry>();
  constructor(private auth: AuthService, private socket: SocketFactory = nodeSocket, private now = Date.now,
    private subscribe = (token: string, broadcasterId: string, sessionId: string, type: EventSubType = "channel.chat.message") => subscribeToEvent(type, auth.config.clientId, token, broadcasterId, sessionId),
    private housingHook?: HousingHook, private followerHook?: HousingHook) {}

  async start(id: string | undefined, kind: ConnectionKind | readonly ConnectionKind[] = "chat") {
    const requested: readonly ConnectionKind[] = typeof kind === "string" ? [kind] : kind;
    if (!requested.length) return;
    const grant = await this.auth.scopedSession(id, true);
    for (const feature of requested) if (!grant.scopes.includes(feature === "chat" ? CHAT_SCOPE : feature === "housing" ? SUBSCRIPTION_SCOPE : FOLLOWER_SCOPE)) throw new AuthError(feature === "chat" ? "chat_scope" : feature === "housing" ? "subscription_scope" : "follower_scope");
    const userId = grant.profile.twitchUserId;
    const existing = this.entries.get(userId);
    if (existing && existing.key === grant.key && requested.every((feature) => existing[feature]) && ["connecting", "connected", "reconnecting"].includes(existing.connection.status)) return;
    const chat = requested.includes("chat") || !!existing?.chat && grant.scopes.includes(CHAT_SCOPE);
    const housing = requested.includes("housing") || !!existing?.housing && grant.scopes.includes(SUBSCRIPTION_SCOPE);
    const followers = requested.includes("followers") || !!existing?.followers && grant.scopes.includes(FOLLOWER_SCOPE);
    existing?.connection.stop();
    if (!existing && this.entries.size >= 100) throw new AuthError("capacity");
    const feed = existing?.feed ?? new LiveChatFeed(userId, this.now());
    const scopes = [...(chat ? [CHAT_SCOPE] : []), ...(housing ? [SUBSCRIPTION_SCOPE] : []), ...(followers ? [FOLLOWER_SCOPE] : [])];
    const types: EventSubType[] = [...(chat ? ["channel.chat.message" as const] : []), ...(housing ? SUBSCRIPTION_EVENTS : []), ...(followers ? ["channel.follow" as const] : [])];
    const entry: Entry = { key: grant.key, feed, chat, housing, followers, touchedAt: this.now(), connection: new EventSubConnection({
      socket: this.socket, now: this.now, random: Math.random,
      authorized: () => this.auth.scopedSessionActive(grant.key, scopes),
      credentials: () => this.auth.scopedCredentials(grant.key, scopes),
      subscribe: (token, sessionId) => Promise.all(types.map(async (type) => ({ type, id: await this.subscribe(token, userId, sessionId, type) }))),
      notification: (value) => {
        if (record(record(value).metadata).subscription_type === "channel.chat.message") feed.receive(value, this.now());
        else if (record(record(value).metadata).subscription_type === "channel.follow") this.followerHook?.enqueue(grant.profile, grant.key, value);
        else this.housingHook?.enqueue(grant.profile, grant.key, value);
      },
      revoked: () => this.auth.revokeChat(grant.key),
    }) };
    this.entries.set(userId, entry); entry.connection.start();
  }
  async stop(id: string | undefined, kind: "chat" | "housing" | "followers" = "chat") {
    const grant = await this.auth.chatSession(id);
    const entry = this.entries.get(grant.profile.twitchUserId);
    if (entry) {
      entry.connection.stop(); entry[kind] = false;
      if (entry.chat || entry.housing || entry.followers) await this.start(id, entry.chat ? "chat" : entry.housing ? "housing" : "followers");
    }
  }
  housingStatus(userId: string) {
    const entry = this.entries.get(userId);
    return { live: entry?.housing ? entry.connection.status : "disconnected", liveReady: !!entry?.housing && entry.connection.subscriptionReady };
  }
  followerStatus(userId: string) {
    const entry = this.entries.get(userId);
    return { live: entry?.followers ? entry.connection.status : "disconnected", liveReady: !!entry?.followers && entry.connection.subscriptionReady };
  }
  /** Read-only activity projection for an already authorized overlay. Never starts a connection. */
  overlayActivity(userId: string) {
    const entry = this.entries.get(userId);
    if (entry) entry.connection.tick();
    const feed = entry?.feed.snapshot(this.now());
    return { ready: !!entry?.chat && entry.connection.subscriptionReady, status: entry?.chat ? entry.connection.status : "disconnected",
      receivedMessages: feed?.receivedMessages ?? 0, sampleAgesMs: entry?.chat ? feed?.sampleAgesMs ?? [] : [] };
  }
  async snapshot(id: string | undefined): Promise<ChatSnapshot> {
    const grant = await this.auth.chatSession(id), { twitchUserId, login, displayName } = grant.profile;
    const entry = this.entries.get(twitchUserId);
    if (entry) { entry.touchedAt = this.now(); entry.connection.tick(); }
    return { channel: { twitchUserId, login, displayName }, townId: liveTownId(twitchUserId), authorized: grant.authorized,
      status: entry?.chat ? entry.connection.status : "disconnected", csrfToken: this.auth.csrfToken(id!),
      socketConnected: entry?.chat && entry.connection.socketConnected || false, subscriptionReady: entry?.chat && entry.connection.subscriptionReady || false,
      ...(entry?.feed.snapshot(this.now()) ?? { lastEventAt: null, receivedMessages: 0, sampleAgesMs: [] }) };
  }
  /** Independent of tabs. Session expiry and validation/revocation terminate sockets. */
  tick() {
    this.housingHook?.tick();
    this.followerHook?.tick();
    for (const [id, entry] of this.entries) {
      entry.connection.tick(); entry.feed.snapshot(this.now());
      if (["disconnected", "revoked", "error"].includes(entry.connection.status) && this.now() - entry.touchedAt > 10 * 60_000) this.entries.delete(id);
    }
  }
  dispose() { for (const entry of this.entries.values()) entry.connection.stop(); this.entries.clear(); }
}

import { AuthError } from "../auth/types";
import type { AuthService } from "../auth/service";
import { EventSubConnection, nodeSocket, type SocketFactory } from "./eventsub";
import { LiveChatFeed } from "./feed";
import { subscribeToChat } from "./subscription";
import { liveTownId, type ChatSnapshot } from "./types";

type Entry = { key: string; connection: EventSubConnection; feed: LiveChatFeed; touchedAt: number };
export class ChatManager {
  private entries = new Map<string, Entry>();
  constructor(private auth: AuthService, private socket: SocketFactory = nodeSocket, private now = Date.now,
    private subscribe = (token: string, broadcasterId: string, sessionId: string) => subscribeToChat(auth.config.clientId, token, broadcasterId, sessionId)) {}

  async start(id: string | undefined) {
    const grant = await this.auth.chatSession(id, true);
    if (!grant.authorized) throw new AuthError("chat_scope");
    const userId = grant.profile.twitchUserId;
    const existing = this.entries.get(userId);
    if (existing && existing.key === grant.key && ["connecting", "connected", "reconnecting"].includes(existing.connection.status)) return;
    existing?.connection.stop();
    if (!existing && this.entries.size >= 100) throw new AuthError("capacity");
    const feed = existing?.feed ?? new LiveChatFeed(userId, this.now());
    const entry: Entry = { key: grant.key, feed, touchedAt: this.now(), connection: new EventSubConnection({
      socket: this.socket, now: this.now, random: Math.random,
      authorized: () => this.auth.chatSessionActive(grant.key),
      credentials: () => this.auth.chatCredentials(grant.key),
      subscribe: (token, sessionId) => this.subscribe(token, userId, sessionId),
      notification: (value) => { feed.receive(value, this.now()); },
      revoked: () => this.auth.revokeChat(grant.key),
    }) };
    this.entries.set(userId, entry); entry.connection.start();
  }
  async stop(id: string | undefined) {
    const grant = await this.auth.chatSession(id);
    this.entries.get(grant.profile.twitchUserId)?.connection.stop();
  }
  async snapshot(id: string | undefined): Promise<ChatSnapshot> {
    const grant = await this.auth.chatSession(id), { twitchUserId, login, displayName } = grant.profile;
    const entry = this.entries.get(twitchUserId);
    if (entry) { entry.touchedAt = this.now(); entry.connection.tick(); }
    return { channel: { twitchUserId, login, displayName }, townId: liveTownId(twitchUserId), authorized: grant.authorized,
      status: entry?.connection.status ?? "disconnected", csrfToken: this.auth.csrfToken(id!),
      socketConnected: entry?.connection.socketConnected ?? false, subscriptionReady: entry?.connection.subscriptionReady ?? false,
      ...(entry?.feed.snapshot(this.now()) ?? { lastEventAt: null, receivedMessages: 0, sampleAgesMs: [] }) };
  }
  /** Independent of tabs. Session expiry and validation/revocation terminate sockets. */
  tick() {
    for (const [id, entry] of this.entries) {
      entry.connection.tick(); entry.feed.snapshot(this.now());
      if (["disconnected", "revoked", "error"].includes(entry.connection.status) && this.now() - entry.touchedAt > 10 * 60_000) this.entries.delete(id);
    }
  }
  dispose() { for (const entry of this.entries.values()) entry.connection.stop(); this.entries.clear(); }
}

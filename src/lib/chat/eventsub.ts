import { isAuthError } from "../auth/types";
import { identifier, record } from "./mapping";
import type { ChatConnectionState } from "./types";
import { chatDiagnostic } from "./diagnostics";
import type { EventSubType } from "./subscription";
export type EventSubRegistration = { id: string; type: EventSubType };

export const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
export type SocketFactory = (url: string, handlers: { message: (data: unknown) => void; closed: (code?: number) => void; error: () => void }) => { close: () => void };
type Slot = { socket?: ReturnType<SocketFactory>; token?: string; welcomed: boolean; sessionId: string; deadline: number; keepalive: number; migrating: boolean; pending: Record<string, unknown>[] };
type Dependencies = {
  socket: SocketFactory; now: () => number; random: () => number;
  credentials: () => Promise<{ accessToken: string }>;
  authorized: () => boolean;
  subscribe: (token: string, sessionId: string) => Promise<string | EventSubRegistration[]>;
  notification: (value: unknown) => void;
  revoked: () => void;
};

/** One channel and its registered subscriptions. tick() drives timeouts/backoff independently of HTTP traffic. */
export class EventSubConnection {
  status: ChatConnectionState = "disconnected";
  private primary?: Slot;
  private handoff?: Slot;
  private subscriptions?: EventSubRegistration[];
  private wanted = false;
  private epoch = 0;
  private attempts = 0;
  private retryAt = 0;
  constructor(private deps: Dependencies) {}
  get socketConnected() { return Boolean(this.primary?.welcomed); }
  get subscriptionReady() { return this.socketConnected && Boolean(this.subscriptions?.length) && this.status === "connected"; }
  start() {
    if (this.wanted) return;
    this.wanted = true; this.attempts = 0;
    void this.fresh();
  }
  stop(status: ChatConnectionState = "disconnected") {
    this.wanted = false; this.epoch++; this.closeSockets(); this.status = status;
    chatDiagnostic("socket", "closed");
  }
  private closeSockets() {
    const a = this.primary, b = this.handoff;
    this.primary = undefined; this.handoff = undefined; this.subscriptions = undefined;
    for (const slot of [a, b]) if (slot) { slot.pending = []; slot.token = undefined; }
    a?.socket?.close(); b?.socket?.close();
  }
  private fail() {
    if (!this.wanted) return;
    this.epoch++; this.closeSockets(); this.status = "reconnecting";
    this.retryAt = this.deps.now() + Math.min(60_000, 1000 * 2 ** Math.min(this.attempts++, 6)) + this.deps.random() * 500;
  }
  private terminal(error: unknown) {
    chatDiagnostic("socket", "failure", {}, error);
    if (isAuthError(error) && ["unauthorized", "chat_scope", "subscription_scope", "invalid_token"].includes(error.code)) {
      this.stop("revoked"); this.deps.revoked();
    } else this.fail();
  }
  private async fresh() {
    const epoch = ++this.epoch;
    this.status = this.attempts ? "reconnecting" : "connecting";
    this.retryAt = Infinity;
    try {
      const credentials = await this.deps.credentials();
      if (epoch !== this.epoch || !this.wanted) return;
      if (!this.deps.authorized()) { this.stop("revoked"); return; }
      this.open(EVENTSUB_URL, false, credentials.accessToken);
    } catch (error) { if (epoch === this.epoch) this.terminal(error); }
  }
  private open(url: string, migrating: boolean, token?: string) {
    chatDiagnostic("socket", "start");
    const slot: Slot = { token, welcomed: false, sessionId: "", deadline: this.deps.now() + 10_000, keepalive: this.primary?.keepalive ?? 30_000, migrating, pending: [] };
    if (migrating) this.handoff = slot; else this.primary = slot;
    try {
      slot.socket = this.deps.socket(url, {
        message: (data) => { void this.message(slot, data); },
        closed: (code) => { if (this.current(slot)) chatDiagnostic("socket", "closed", { reason: "socket_closed", closeCode: code }); this.closed(slot); },
        error: () => { if (this.current(slot)) chatDiagnostic("socket", "failure", { reason: "socket_error" }); this.closed(slot); },
      });
    } catch (error) { chatDiagnostic("socket", "failure", {}, error); this.fail(); }
  }
  private current(slot: Slot) { return this.wanted && (this.primary === slot || this.handoff === slot); }
  private closed(slot: Slot) {
    if (!this.current(slot)) return;
    // The transferred session can still finish its handoff after the old edge closes.
    if (slot === this.primary && this.handoff) { this.primary = undefined; slot.socket?.close(); return; }
    this.fail();
  }
  private async message(slot: Slot, data: unknown) {
    if (!this.current(slot)) return;
    if (!this.deps.authorized()) { this.stop("revoked"); return; }
    if (typeof data !== "string" || data.length > 128_000) { chatDiagnostic("frame", "rejected", { reason: "invalid_frame" }); return; }
    let envelope: Record<string, unknown>;
    try { envelope = record(JSON.parse(data)); } catch { chatDiagnostic("frame", "rejected", { reason: "invalid_json" }); return; }
    const meta = record(envelope.metadata), payload = record(envelope.payload);
    if (meta.message_type === "notification") chatDiagnostic("notification", "received", { chatEvent: meta.subscription_type === "channel.chat.message" });
    if (meta.message_type === "session_welcome") {
      if (slot.welcomed) return;
      const session = record(payload.session), seconds = session.keepalive_timeout_seconds;
      if (!identifier(session.id) || session.status !== "connected"
        || !(Number.isInteger(seconds) && Number(seconds) >= 10 && Number(seconds) <= 600 || slot.migrating && seconds === null)) {
        chatDiagnostic("welcome", "rejected", { reason: "invalid_welcome" }); this.fail(); return;
      }
      slot.welcomed = true; slot.sessionId = session.id;
      slot.keepalive = typeof seconds === "number" ? seconds * 1000 : slot.keepalive;
      slot.deadline = this.deps.now() + slot.keepalive;
      chatDiagnostic("welcome", "success");
      if (slot.migrating) {
        const old = this.primary; this.primary = slot; this.handoff = undefined;
        old?.socket?.close(); this.status = "connected"; this.attempts = 0;
        chatDiagnostic("reconnect", "success");
        return; // Twitch transferred the subscription. Do not subscribe again.
      }
      try {
        const token = slot.token!; slot.token = undefined;
        const id = await this.deps.subscribe(token, slot.sessionId);
        if (!this.current(slot)) return;
        if (!this.deps.authorized()) { this.stop("revoked"); return; }
        this.subscriptions = typeof id === "string" ? [{ id, type: "channel.chat.message" }] : id;
        this.status = "connected"; this.attempts = 0;
        chatDiagnostic("subscription_ready", "success");
        const pending = slot.pending; slot.pending = [];
        for (const envelope of pending) this.deliver(slot, envelope);
      } catch (error) { if (this.current(slot)) this.terminal(error); }
      return;
    }
    if (!slot.welcomed) { chatDiagnostic("frame", "ignored", { reason: "before_welcome" }); return; }
    if (meta.message_type === "session_keepalive") { slot.deadline = this.deps.now() + slot.keepalive; chatDiagnostic("keepalive", "received"); return; }
    if (meta.message_type === "session_reconnect" && slot === this.primary && !this.handoff && this.subscriptions?.length) {
      const session = record(payload.session), url = session.reconnect_url;
      if (session.id !== slot.sessionId || typeof url !== "string") { chatDiagnostic("reconnect", "rejected", { reason: "invalid_reconnect" }); return; }
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "wss:" || parsed.hostname !== "eventsub.wss.twitch.tv" || parsed.port || parsed.username || parsed.password || parsed.hash) throw new Error();
      } catch { chatDiagnostic("reconnect", "rejected", { reason: "invalid_reconnect" }); this.fail(); return; }
      this.status = "reconnecting";
      chatDiagnostic("reconnect", "start");
      slot.deadline = this.deps.now() + 30_000;
      this.open(url, true); // Preserve Twitch's URL byte-for-byte.
      return;
    }
    this.deliver(slot, envelope);
  }
  private deliver(slot: Slot, envelope: Record<string, unknown>) {
    if (!this.current(slot)) return;
    const meta = record(envelope.metadata), payload = record(envelope.payload);
    const subscription = record(payload.subscription), transport = record(subscription.transport);
    if (meta.message_type !== "notification" && meta.message_type !== "revocation") { chatDiagnostic("frame", "ignored", { reason: "unsupported_message" }); return; }
    // Twitch may deliver as soon as the subscription exists, before fetch resolves.
    // Hold a bounded number on this socket, then verify the returned subscription ID.
    if (!this.subscriptions && !slot.migrating) {
      if (slot.pending.length >= 100) { chatDiagnostic("notification", "ignored", { reason: "pending_capacity" }); return; }
      slot.pending.push(envelope);
      chatDiagnostic("notification", "received", { reason: "subscription_pending" });
      return;
    }
    const registered = this.subscriptions?.find((item) => item.id === subscription.id);
    const reason = !this.subscriptions ? "subscription_pending" : !registered ? "subscription_mismatch"
      : subscription.type !== registered.type || subscription.version !== "1" ? "event_type"
      : transport.method !== "websocket" ? "transport_mismatch" : transport.session_id !== slot.sessionId ? "session_mismatch" : null;
    if (reason) { chatDiagnostic("notification", "rejected", { reason }); return; }
    if (meta.message_type === "revocation") { chatDiagnostic("revocation", "received"); this.stop("revoked"); this.deps.revoked(); return; }
    if (meta.message_type === "notification") {
      slot.deadline = this.deps.now() + slot.keepalive;
      this.deps.notification(envelope);
    }
  }
  tick() {
    if (!this.wanted) return;
    if (!this.deps.authorized()) { this.stop("revoked"); return; }
    const now = this.deps.now();
    if (this.handoff && now >= this.handoff.deadline || this.primary && now >= this.primary.deadline) { chatDiagnostic("socket", "failure", { reason: "timeout" }); this.fail(); return; }
    if (!this.primary && !this.handoff && now >= this.retryAt) void this.fresh();
  }
}

/** Node's native WebSocket handles ping/pong. There is intentionally no send API here. */
export const nodeSocket: SocketFactory = (url, handlers) => {
  const socket = new WebSocket(url);
  socket.onmessage = (event) => handlers.message(event.data);
  socket.onclose = (event) => handlers.closed(event.code); socket.onerror = handlers.error;
  return { close() { socket.onmessage = null; socket.onclose = null; socket.onerror = () => {}; try { socket.close(); } catch { /* Already closed. */ } } };
};

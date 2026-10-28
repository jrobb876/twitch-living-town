import type { TownEvent } from "../simulation/types";
import { liveTownId } from "./types";
import type { ChatReason } from "./diagnostics";

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function identifier(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(value); }
/** Twitch message IDs are opaque strings, not URL-safe identifiers. Never normalize their contents. */
export function messageIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length <= 4096 && value.trim().length > 0
    && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}
const userId = (value: unknown): value is string => typeof value === "string" && /^\d{1,30}$/.test(value);

/** The socket/session subscription is checked by the caller; this checks channel and payload identity. */
export function mapChatNotification(value: unknown, broadcasterId: string, receivedAt: number, rejected: (reason: ChatReason) => void = () => {}): Extract<TownEvent, { type: "CHAT_MESSAGE" }> | null {
  const envelope = record(value), metadata = record(envelope.metadata), payload = record(envelope.payload);
  const subscription = record(payload.subscription), condition = record(subscription.condition), event = record(payload.event), message = record(event.message);
  const occurredAt = typeof metadata.message_timestamp === "string" ? Date.parse(metadata.message_timestamp) : NaN;
  const reject = (reason: ChatReason) => { rejected(reason); return null; };
  if (metadata.message_type !== "notification" || metadata.subscription_type !== "channel.chat.message" || metadata.subscription_version !== "1"
    || subscription.type !== "channel.chat.message" || subscription.version !== "1") return reject("event_type");
  if (subscription.status !== "enabled") return reject("subscription_disabled");
  if (condition.broadcaster_user_id !== broadcasterId || condition.user_id !== broadcasterId || event.broadcaster_user_id !== broadcasterId) return reject("channel_mismatch");
  if (!userId(broadcasterId) || !userId(event.chatter_user_id)) return reject("invalid_identity");
  if (!messageIdentifier(metadata.message_id) || !messageIdentifier(event.message_id)) return reject("invalid_message_id");
  if (!Number.isFinite(occurredAt)) return reject("invalid_timestamp");
  if (receivedAt - occurredAt >= 10 * 60_000) return reject("stale_timestamp");
  if (occurredAt - receivedAt > 60_000) return reject("future_timestamp");
  if (typeof event.chatter_user_name !== "string" || !event.chatter_user_name.trim() || event.chatter_user_name.length > 100) return reject("invalid_display_name");
  if (typeof message.text !== "string" || message.text.length > 5000 || !message.text.trim()) return reject("invalid_message");
  return { type: "CHAT_MESSAGE", id: `twitch:chat:${broadcasterId}:${event.message_id}`, townId: liveTownId(broadcasterId), occurredAt,
    user: { twitchUserId: event.chatter_user_id, displayName: event.chatter_user_name }, message: message.text };
}

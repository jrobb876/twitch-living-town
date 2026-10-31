import { messageIdentifier, record } from "../chat/mapping";
export function mapFollowNotification(value: unknown, broadcasterId: string, now: number) {
  const envelope = record(value), meta = record(envelope.metadata), payload = record(envelope.payload);
  const sub = record(payload.subscription), condition = record(sub.condition), event = record(payload.event);
  const at = typeof meta.message_timestamp === "string" ? Date.parse(meta.message_timestamp) : NaN;
  const followedAt = typeof event.followed_at === "string" ? Date.parse(event.followed_at) : NaN;
  if (meta.message_type !== "notification" || meta.subscription_type !== "channel.follow" || meta.subscription_version !== "2"
    || sub.type !== "channel.follow" || sub.version !== "2" || sub.status !== "enabled"
    || condition.broadcaster_user_id !== broadcasterId || condition.moderator_user_id !== broadcasterId || event.broadcaster_user_id !== broadcasterId
    || !messageIdentifier(meta.message_id) || !Number.isFinite(at) || at > now + 60000 || now - at > 600000
    || !Number.isFinite(followedAt) || followedAt > at + 60000
    || typeof event.user_id !== "string" || !/^\d{1,30}$/.test(event.user_id)
    || typeof event.user_name !== "string" || !event.user_name.trim() || event.user_name.length > 100) return null;
  return { id: `eventsub:${meta.message_id}`, occurredAt: at, user: { twitchUserId: event.user_id, displayName: event.user_name } };
}

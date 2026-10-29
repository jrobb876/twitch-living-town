import { z } from "zod";
import { record, messageIdentifier } from "../chat/mapping";
import { SUBSCRIPTION_EVENTS, type SubscriptionEventType, type VerifiedSubscriber } from "./types";
export type HousingNotification = { id: string; type: SubscriptionEventType; occurredAt: number;
  user: VerifiedSubscriber | null; total: number; months: number | null };
const tier = z.enum(["1000", "2000", "3000"]);
/** Called only after the existing socket verifies the registered subscription and transport. Chat text is never copied. */
export function mapHousingNotification(value: unknown, broadcasterId: string, now: number): HousingNotification | null {
  const envelope = record(value), meta = record(envelope.metadata), payload = record(envelope.payload), sub = record(payload.subscription);
  const condition = record(sub.condition), event = record(payload.event), type = sub.type as SubscriptionEventType;
  const occurredAt = typeof meta.message_timestamp === "string" ? Date.parse(meta.message_timestamp) : NaN;
  if (meta.message_type !== "notification" || !SUBSCRIPTION_EVENTS.includes(type) || meta.subscription_type !== type || sub.version !== "1"
    || meta.subscription_version !== "1" || sub.status !== "enabled" || condition.broadcaster_user_id !== broadcasterId
    || event.broadcaster_user_id !== broadcasterId || !messageIdentifier(meta.message_id) || !Number.isFinite(occurredAt)
    || occurredAt > now + 60000 || now - occurredAt > 600000 || !tier.safeParse(event.tier).success) return null;
  const anonymous = type === "channel.subscription.gift" && event.is_anonymous === true;
  if (type === "channel.subscription.gift" && typeof event.is_anonymous !== "boolean") return null;
  if (!anonymous && (typeof event.user_id !== "string" || !/^\d{1,30}$/.test(event.user_id)
    || typeof event.user_name !== "string" || !event.user_name.trim() || event.user_name.length > 100)) return null;
  if (["channel.subscribe", "channel.subscription.end"].includes(type) && typeof event.is_gift !== "boolean") return null;
  if (type === "channel.subscription.gift" && (!Number.isSafeInteger(event.total) || Number(event.total) < 1 || Number(event.total) > 10000)) return null;
  if (type === "channel.subscription.message" && (!Number.isSafeInteger(event.cumulative_months) || Number(event.cumulative_months) < 1 || Number(event.cumulative_months) > 10000)) return null;
  return { id: `eventsub:${meta.message_id}`, type, occurredAt,
    user: anonymous ? null : { twitchUserId: event.user_id as string, displayName: event.user_name as string, tier: event.tier as VerifiedSubscriber["tier"], isGift: event.is_gift === true },
    total: type === "channel.subscription.gift" ? Number(event.total) : 0,
    months: type === "channel.subscription.message" ? Number(event.cumulative_months) : null };
}

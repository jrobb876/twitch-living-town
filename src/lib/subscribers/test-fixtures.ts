import { NOW } from "../chat/test-fixtures";
import type { SubscriptionEventType, VerifiedSubscriber } from "./types";

export const subscriber = (id = "777"): VerifiedSubscriber => ({ twitchUserId: id, displayName: `Neighbor ${id}`, tier: "1000", isGift: false });
export function housingNotification(type: SubscriptionEventType = "channel.subscribe", broadcaster = "12345", id = "delivery:fixture/+==", at = NOW) {
  return { metadata: { message_type: "notification", message_id: id, message_timestamp: new Date(at).toISOString(), subscription_type: type, subscription_version: "1" },
    payload: { subscription: { id: `sub-${type}`, type, version: "1", status: "enabled", condition: { broadcaster_user_id: broadcaster }, transport: { method: "websocket", session_id: "socket-1" } },
      event: { broadcaster_user_id: broadcaster, user_id: "777", user_name: "Neighbor 777", tier: "1000", is_gift: false, is_anonymous: false,
        total: 3, cumulative_months: 7, message: { text: "private resub message, never retained" } } } };
}

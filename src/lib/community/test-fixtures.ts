import { NOW } from "../chat/test-fixtures";
export function followNotification(broadcasterId = "12345", userId = "777", id = "follow-fixture", now = NOW) {
  return { metadata: { message_type: "notification", message_id: id, message_timestamp: new Date(now).toISOString(), subscription_type: "channel.follow", subscription_version: "2" },
    payload: { subscription: { id: "sub-channel.follow", type: "channel.follow", version: "2", status: "enabled",
      condition: { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId }, transport: { method: "websocket", session_id: "socket-1" } },
    event: { broadcaster_user_id: broadcasterId, user_id: userId, user_name: "Neighbor", followed_at: new Date(now).toISOString() } } };
}

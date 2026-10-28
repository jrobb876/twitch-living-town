import type { SocketFactory } from "./eventsub";
export const NOW = Date.UTC(2026, 9, 27, 12);
export const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
export function sockets() {
  const opened: { url: string; closed: boolean; receive: (data: unknown) => void; disconnect: () => void; error: () => void }[] = [];
  const factory: SocketFactory = (url, handlers) => {
    const socket = { url, closed: false, receive: (data: unknown) => handlers.message(typeof data === "string" ? data : JSON.stringify(data)),
      disconnect: handlers.closed, error: handlers.error };
    opened.push(socket);
    return { close: () => { socket.closed = true; } };
  };
  return { factory, opened };
}
export const welcome = (id = "socket-1", seconds: number | null = 30) => ({ metadata: { message_type: "session_welcome" },
  payload: { session: { id, status: "connected", keepalive_timeout_seconds: seconds } } });
export function chatMessage(id = "message-1", userId = "111", text = "Lovely town!", broadcasterId = "12345", now = NOW, socketId = "socket-1") {
  return { metadata: { message_type: "notification", message_id: `delivery-${id}`, message_timestamp: new Date(now).toISOString(), subscription_type: "channel.chat.message", subscription_version: "1" },
    payload: { subscription: { id: "sub-1", type: "channel.chat.message", version: "1", status: "enabled",
      condition: { broadcaster_user_id: broadcasterId, user_id: broadcasterId }, transport: { method: "websocket", session_id: socketId } },
    event: { broadcaster_user_id: broadcasterId, chatter_user_id: userId, chatter_user_name: "Neighbor", message_id: id, message: { text } } } };
}

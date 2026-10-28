import { authErrorCategory } from "../auth/diagnostics";

export type ChatReason = "invalid_frame" | "invalid_json" | "before_welcome" | "invalid_welcome"
  | "unsupported_message" | "subscription_pending" | "pending_capacity" | "subscription_mismatch"
  | "event_type" | "transport_mismatch" | "session_mismatch" | "subscription_disabled"
  | "channel_mismatch" | "invalid_identity" | "invalid_message_id" | "invalid_timestamp"
  | "stale_timestamp" | "future_timestamp" | "invalid_display_name" | "invalid_message"
  | "duplicate_message" | "dedup_capacity" | "processor_duplicate" | "processor_rejected"
  | "socket_closed" | "socket_error" | "timeout" | "invalid_reconnect" | "response_mismatch";
type Operation = "socket" | "welcome" | "keepalive" | "reconnect" | "revocation" | "subscription_create"
  | "subscription_ready" | "notification" | "event_processor" | "frame";
type Outcome = "start" | "success" | "failure" | "received" | "accepted" | "ignored" | "rejected" | "closed";
type Details = {
  reason?: ChatReason; httpStatus?: number; closeCode?: number;
  subscriptionIdPresent?: boolean; enabled?: boolean; chatEvent?: boolean; websocket?: boolean;
  broadcasterMatches?: boolean; userMatches?: boolean; sessionMatches?: boolean;
  receivedMessages?: number; activityAwarded?: boolean;
};

/** Only explicitly selected booleans/numbers and local enums leave this boundary. No payloads or IDs. */
export function createChatDiagnosticLogger(write: (entry: Record<string, unknown>) => void, enabled: () => boolean) {
  return (operation: Operation, outcome: Outcome, details: Details = {}, error?: unknown) => {
    if (!enabled()) return;
    const entry: Record<string, unknown> = { event: "twitch_chat", operation, outcome };
    if (operation === "subscription_create") entry.endpoint = "api.twitch.tv/helix/eventsub/subscriptions";
    if (details.reason) entry.reason = details.reason;
    for (const key of ["subscriptionIdPresent", "enabled", "chatEvent", "websocket", "broadcasterMatches", "userMatches", "sessionMatches", "activityAwarded"] as const) {
      if (typeof details[key] === "boolean") entry[key] = details[key];
    }
    for (const key of ["httpStatus", "closeCode", "receivedMessages"] as const) {
      if (Number.isSafeInteger(details[key]) && details[key]! >= 0) entry[key] = details[key];
    }
    if (error !== undefined) entry.category = authErrorCategory(error);
    try { write(entry); } catch { /* Diagnostics must not interrupt chat. */ }
  };
}
export const chatDiagnostic = createChatDiagnosticLogger((entry) => console.info(JSON.stringify(entry)), () => process.env.NODE_ENV === "development");

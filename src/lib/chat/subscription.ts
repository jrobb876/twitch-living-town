import { AuthError } from "../auth/types";
import { identifier, record } from "./mapping";
import { chatDiagnostic } from "./diagnostics";
import type { SubscriptionEventType } from "../subscribers/types";
export type EventSubType = "channel.chat.message" | SubscriptionEventType;

export async function subscribeToChat(clientId: string, accessToken: string, broadcasterId: string, sessionId: string, request: typeof fetch = fetch) {
  return subscribeToEvent("channel.chat.message", clientId, accessToken, broadcasterId, sessionId, request);
}
export async function subscribeToEvent(type: EventSubType, clientId: string, accessToken: string, broadcasterId: string, sessionId: string, request: typeof fetch = fetch) {
  const chat = type === "channel.chat.message";
  let response: Response;
  chatDiagnostic("subscription_create", "start");
  try {
    response = await request("https://api.twitch.tv/helix/eventsub/subscriptions", { method: "POST", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": clientId, "Content-Type": "application/json" },
      body: JSON.stringify({ type, version: "1", condition: { broadcaster_user_id: broadcasterId, ...(chat ? { user_id: broadcasterId } : {}) },
        transport: { method: "websocket", session_id: sessionId } }),
    });
  } catch (error) { chatDiagnostic("subscription_create", "failure", {}, error); throw new AuthError("unavailable"); }
  chatDiagnostic("subscription_create", response.status === 202 ? "received" : "failure", { httpStatus: response.status });
  if (response.status === 401) throw new AuthError("invalid_token");
  if (response.status === 403) throw new AuthError(chat ? "chat_scope" : "subscription_scope");
  if (response.status !== 202) throw new AuthError("unavailable");
  try {
    const body = record(await response.json()), data = Array.isArray(body.data) ? record(body.data[0]) : {};
    const condition = record(data.condition), transport = record(data.transport);
    const checks = { httpStatus: response.status, subscriptionIdPresent: identifier(data.id), enabled: data.status === "enabled",
      chatEvent: data.type === "channel.chat.message" && data.version === "1", broadcasterMatches: condition.broadcaster_user_id === broadcasterId,
      userMatches: !chat || condition.user_id === broadcasterId, websocket: transport.method === "websocket", sessionMatches: transport.session_id === sessionId };
    if (!identifier(data.id) || data.status !== "enabled" || data.type !== type || data.version !== "1"
      || condition.broadcaster_user_id !== broadcasterId || (chat && condition.user_id !== broadcasterId)
      || transport.method !== "websocket" || transport.session_id !== sessionId) {
      chatDiagnostic("subscription_create", "failure", { ...checks, reason: "response_mismatch" });
      throw new AuthError("unavailable");
    }
    chatDiagnostic("subscription_create", "success", checks);
    return data.id;
  } catch (error) { chatDiagnostic("subscription_create", "failure", {}, error); throw new AuthError("unavailable"); }
}

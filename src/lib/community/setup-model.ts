import { z } from "zod";
import { CHAT_SCOPE, FOLLOWER_SCOPE, SUBSCRIPTION_SCOPE } from "../auth/types";

export const features = ["followers", "subscribers", "chat"] as const;
export type Feature = typeof features[number];
export const selectionSchema = z.object({ followers: z.boolean(), subscribers: z.boolean(), chat: z.boolean() }).strict();
export type Selection = z.infer<typeof selectionSchema>;
export const defaultSelection: Selection = { followers: true, subscribers: true, chat: true };
export const featureScopes = { followers: FOLLOWER_SCOPE, subscribers: SUBSCRIPTION_SCOPE, chat: CHAT_SCOPE };
export const featureLabels = { followers: "Followers", subscribers: "Subscribers", chat: "Twitch chat" };
export type ImportState = { status: "not_started" | "running" | "complete" | "partial" | "failed"; error: string | null; count: number; retryAt: number };
export type SetupStatus = {
  townId: string; csrfToken: string; permissions: Selection;
  imports: Record<"followers" | "subscribers", ImportState>;
  live: Record<Feature, { status: string; ready: boolean; error: string | null }>;
};
export function missingPermissions(status: SetupStatus, selected: Selection) {
  return features.filter((feature) => selected[feature] && !status.permissions[feature]);
}
export function featureComplete(status: SetupStatus, feature: Feature) {
  return status.permissions[feature] && status.live[feature].ready && !status.live[feature].error
    && (feature === "chat" || status.imports[feature].status === "complete");
}
export function connectionLabel(status: SetupStatus, selected: Selection) {
  const wanted = features.filter((feature) => selected[feature]);
  if (!wanted.length) return "Choose features";
  const importing = wanted.some((f) => f !== "chat" && status.imports[f].status === "running");
  if (importing) return "Importing";
  const complete = (f: Feature) => featureComplete(status, f);
  if (wanted.every(complete)) return "Connected";
  if (wanted.some(complete)) return "Partially connected";
  if (missingPermissions(status, selected).length) return "Permission required";
  if (wanted.some((f) => status.live[f].error || ["error", "revoked"].includes(status.live[f].status)
    || f !== "chat" && ["partial", "failed"].includes(status.imports[f].status))) return "Failed — Retry";
  if (wanted.some((f) => ["connecting", "reconnecting"].includes(status.live[f].status))) return "Reconnecting";
  return "Connection lost";
}

// Non-secret, tab-local intent only. It never proves authorization; the POST
// rechecks session, CSRF, scopes and the server-owned town on every invocation.
export const intentKey = "living-town:community-setup";
export const preferencesKey = (townId: string) => `living-town:community-features:${townId}`;
const intentSchema = z.object({ townId: z.string(), selected: selectionSchema, expiresAt: z.number(), phase: z.literal("authorizing") }).strict();
export function continuation(raw: string | null, townId: string, result: string | null, now = Date.now()) {
  try {
    const value = intentSchema.parse(JSON.parse(raw ?? "null"));
    return result === "authorized" && value.townId === townId && value.expiresAt > now && value.expiresAt <= now + 10 * 60000 ? value.selected : null;
  } catch { return null; }
}

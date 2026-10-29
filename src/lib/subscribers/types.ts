import type { SubscriberSync, TownEffect, MayorState } from "../simulation/types";
export type HousingPresentation = { id: string; townId: string; expiresAt: number; effects: TownEffect[]; tasks: MayorState["tasks"] };
export const SUBSCRIPTION_EVENTS = ["channel.subscribe", "channel.subscription.end", "channel.subscription.gift", "channel.subscription.message"] as const;
export type SubscriptionEventType = typeof SUBSCRIPTION_EVENTS[number];
export type VerifiedSubscriber = { twitchUserId: string; displayName: string; tier: "1000" | "2000" | "3000"; isGift: boolean };
export const housingMessages = {
  subscription_scope: "Authorize Subscriber Housing for this broadcaster first.",
  unavailable: "Subscriber verification is unavailable. Saved houses are retained; retry synchronization.",
  unsupported: "Twitch did not allow subscriber access for this channel. Check channel subscription availability and permissions.",
  invalid_response: "Twitch returned an incomplete or invalid subscriber response. Sync was not marked complete.",
  rate_limited: "Twitch rate limited subscriber access. Wait before retrying sync.",
  capacity: "The sync or delivery queue reached its safety limit. Progress is retained; retry and inspect the sync status.",
  busy: "Subscriber synchronization is already running for this channel.",
  not_found: "Create your persistent town before connecting Subscriber Housing.",
} as const;
export type HousingCode = keyof typeof housingMessages;
export class HousingError extends Error { constructor(readonly code: HousingCode) { super(code); this.name = "HousingError"; } }
export function housingCode(error: unknown): HousingCode {
  const item = error as { code?: unknown } | null;
  return typeof item?.code === "string" && Object.hasOwn(housingMessages, item.code) ? item.code as HousingCode : "unavailable";
}
export type HousingStatus = { authorized: boolean; hasTown: boolean; csrfToken: string; live: string; liveReady: boolean;
  lastSync: SubscriberSync | null; active: number; legacy: number; verifiedHouses: number; availablePlots: number; waitlisted: number;
  deliveryError: HousingCode | null; pendingEvents: number; revision: number | null; presentations: HousingPresentation[] };

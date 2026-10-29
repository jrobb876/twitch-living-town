import type { Point, Town } from "../town/types";

export type TwitchIdentity = { twitchUserId: string; displayName: string };
/** World units are independent of camera zoom, viewport size and asset resolution. */
export type WorldPosition = Point;
export type HouseAppearance = {
  roofColor: number; wallColor: number; flowerColor: number;
  architecture: "cottage" | "simple" | "dormer";
  decorations: string[];
};
export type ResidentialPlot = {
  id: string; districtId: string; position: WorldPosition; entranceNodeId: string;
  buildingId: string | null;
};
export type Building = {
  id: string; kind: "town-hall"; position: WorldPosition;
} | {
  id: string; kind: "house"; plotId: string; position: WorldPosition;
  ownerTwitchUserId: string | null; appearance: HouseAppearance;
  property?: { size: "small" | "medium" | "large"; prestige: number; status: "unclaimed" | "verified_subscriber" | "legacy"; customization: Record<string, string | number | boolean> };
};
export type HouseBuilding = Extract<Building, { kind: "house" }>;
export type Resident = TwitchIdentity & {
  id: string; isFollower: boolean; isSubscriber: boolean; subscriptionMonths: number;
  houseId: string | null; housingStatus: "none" | "housed" | "waiting";
  subscription?: SubscriptionEvidence;
};
export type SubscriptionEvidence = { active: boolean; tier: "1000" | "2000" | "3000"; isGift: boolean; verifiedAt: number; source: "sync" | "eventsub" };
export type SubscriberSync = { id: string; status: "running" | "complete" | "partial" | "failed"; startedAt: number; finishedAt: number | null;
  imported: number; updated: number; unchanged: number; waitlisted: number; failed: number; pages: number; error: string | null };
export type TownEvent = { id: string; townId: string; occurredAt: number } & (
  | { type: "CHAT_MESSAGE"; user: TwitchIdentity; message: string }
  | { type: "NEW_FOLLOWER"; user: TwitchIdentity }
  | { type: "NEW_SUBSCRIBER"; user: TwitchIdentity; subscription?: SubscriptionEvidence; gift?: { groupId: string; gifter: TwitchIdentity } }
  | { type: "RESUBSCRIPTION"; user: TwitchIdentity; cumulativeMonths: number; subscription?: SubscriptionEvidence }
  | { type: "SUBSCRIPTION_ENDED"; user: TwitchIdentity; subscription: SubscriptionEvidence }
  | { type: "GIFT_SUBSCRIPTION"; groupId: string; gifter: TwitchIdentity | null; total: number; recipients: TwitchIdentity[] }
  | { type: "INCOMING_RAID"; raider: TwitchIdentity; viewers: number }
);
export type EventOutcome = {
  eventId: string; type: TownEvent["type"]; status: "applied" | "duplicate" | "rejected";
  message: string; houseIds: string[]; residentIds: string[];
};
export type GiftGroup = {
  id: string; gifter: TwitchIdentity | null; announcedCount: number; recipientIds: string[];
};
/** JSON-safe durable snapshot; runtime movement/activity is stored separately. */
export type TownWorld = {
  schemaVersion: 1; generatorVersion: 1;
  id: string; streamerTwitchUserId: string; name: string; seed: number;
  layout: Omit<Town, "houses" | "expansion" | "regions">;
  districts: { id: string; name: string; kind: "civic" | "residential"; plotIds: string[];
    generation?: { version: 1; index: number; seed: number; x: number; y: number; width: number; height: number } }[];
  plots: ResidentialPlot[]; buildings: Building[]; residents: Resident[];
  mayor: { id: string; name: string; species: "cat"; headquartersId: string;
    appearance?: { preset: "default" }; personality?: { curiosity: number; energy: number } };
  processedEvents: EventOutcome[]; giftGroups: GiftGroup[];
  subscriberSync?: SubscriberSync;
};
export type TownEffect = {
  id: string; kind: "arrival" | "housewarming" | "welcome-back" | "gift" | "raid" | "neighborhood";
  position: WorldPosition; label: string; startedAt: number; expiresAt: number;
};
export type Activity = {
  samples: { userId: string; message: string; at: number }[];
  score: number; level: "peaceful" | "stirring" | "lively";
};
export type ActorState = {
  position: WorldPosition; nodeId: string; targetNodeId: string | null;
  previousNodeId: string | null; restUntil: number; steps: number;
};
export type MayorState = ActorState & {
  behavior: "idle" | "wandering" | "approaching" | "celebrating" | "welcoming";
  tasks: { nodeId: string; kind: "celebrate" | "welcome"; expiresAt: number }[];
  celebrationUntil: number;
};
export type TownRuntime = {
  now: number; activity: Activity; mayor: MayorState;
  residentActors: { residentId: string; actor: ActorState }[];
  effects: TownEffect[];
};
export type TownSession = { world: TownWorld; runtime: TownRuntime };

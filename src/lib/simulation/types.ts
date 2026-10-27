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
};
export type HouseBuilding = Extract<Building, { kind: "house" }>;
export type Resident = TwitchIdentity & {
  id: string; isFollower: boolean; isSubscriber: boolean; subscriptionMonths: number;
  houseId: string | null; housingStatus: "none" | "housed" | "waiting";
};
export type TownEvent = { id: string; townId: string; occurredAt: number } & (
  | { type: "CHAT_MESSAGE"; user: TwitchIdentity; message: string }
  | { type: "NEW_FOLLOWER"; user: TwitchIdentity }
  | { type: "NEW_SUBSCRIBER"; user: TwitchIdentity; gift?: { groupId: string; gifter: TwitchIdentity } }
  | { type: "RESUBSCRIPTION"; user: TwitchIdentity; cumulativeMonths: number }
  | { type: "GIFT_SUBSCRIPTION"; groupId: string; gifter: TwitchIdentity; total: number; recipients: TwitchIdentity[] }
  | { type: "INCOMING_RAID"; raider: TwitchIdentity; viewers: number }
);
export type EventOutcome = {
  eventId: string; type: TownEvent["type"]; status: "applied" | "duplicate" | "rejected";
  message: string; houseIds: string[]; residentIds: string[];
};
export type GiftGroup = {
  id: string; gifter: TwitchIdentity; announcedCount: number; recipientIds: string[];
};
/** JSON-safe durable snapshot; persistence is currently in memory only. */
export type TownWorld = {
  schemaVersion: 1; generatorVersion: 1;
  id: string; streamerTwitchUserId: string; name: string; seed: number;
  layout: Omit<Town, "houses" | "expansion">;
  districts: { id: string; name: string; kind: "civic" | "residential"; plotIds: string[] }[];
  plots: ResidentialPlot[]; buildings: Building[]; residents: Resident[];
  mayor: { id: string; name: string; species: "cat"; headquartersId: string };
  processedEvents: EventOutcome[]; giftGroups: GiftGroup[];
};
export type TownEffect = {
  id: string; kind: "arrival" | "housewarming" | "welcome-back" | "gift" | "raid";
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

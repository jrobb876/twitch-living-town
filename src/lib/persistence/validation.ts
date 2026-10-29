import { z } from "zod";
import type { TownWorld } from "../simulation/types";
import { PersistenceError } from "./types";

const id = z.string().min(1).max(256);
export const twitchId = z.string().regex(/^\d{1,30}$/);
export const subscriptionSchema = z.object({ active: z.boolean(), tier: z.enum(["1000", "2000", "3000"]), isGift: z.boolean(),
  verifiedAt: z.number().finite().nonnegative(), source: z.enum(["sync", "eventsub"]) }).strict();
export const syncSchema = z.object({ id: z.uuid(), status: z.enum(["running", "complete", "partial", "failed"]), startedAt: z.number().nonnegative(), finishedAt: z.number().nonnegative().nullable(),
  imported: z.number().int().nonnegative(), updated: z.number().int().nonnegative(), unchanged: z.number().int().nonnegative(), waitlisted: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(), error: z.string().max(40).nullable() }).strict();
export const townIdSchema = z.uuid();
export const nameSchema = z.string().trim().min(1).max(60).refine((value) => !Array.from(value).some((c) => c.charCodeAt(0) < 32));
const point = z.object({ x: z.number().finite().min(-10000).max(10000), y: z.number().finite().min(-10000).max(10000) }).strict();
const color = z.number().int().min(0).max(0xffffff);
export const appearanceSchema = z.object({ roofColor: color, wallColor: color, flowerColor: color,
  architecture: z.enum(["cottage", "simple", "dormer"]), decorations: z.array(z.string().max(40)).max(12) }).strict();
export const propertySchema = z.object({ size: z.enum(["small", "medium", "large"]), prestige: z.number().int().min(0).max(5),
  status: z.enum(["unclaimed", "verified_subscriber", "legacy"]),
  customization: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/), z.union([z.string().max(120), z.number().finite(), z.boolean()])).refine((v) => Object.keys(v).length <= 20) }).strict();
export const mayorInputSchema = z.object({ name: nameSchema,
  appearance: z.object({ preset: z.enum(["default", "cream", "orange", "gray", "dark"]) }).strict().optional(),
  personality: z.object({ curiosity: z.number().min(0).max(1), energy: z.number().min(0).max(1), preset: z.enum(["playful", "curious", "calm", "mischievous"]).optional() }).strict().optional() }).strict();
export const townSettingsSchema = z.object({ name: nameSchema, mayor: mayorInputSchema }).strict();
export const createTownSchema = z.object({ name: nameSchema, mayorName: nameSchema, seed: z.number().int().min(0).max(4294967295).optional(),
  mayorAppearance: mayorInputSchema.shape.appearance, mayorPersonality: mayorInputSchema.shape.personality }).strict();
export const layoutSchema = z.object({ seed: z.number().int().min(0).max(4294967295), width: z.number().positive().max(10000), height: z.number().positive().max(10000),
  plaza: point, hall: point, trees: z.array(point.extend({ size: z.number().positive().max(500), variant: z.number().int().min(0).max(10) })).max(2000),
  roads: z.array(z.object({ from: point, to: point, width: z.number().positive().max(500) }).strict()).max(2048),
  navigation: z.array(point.extend({ id, neighbors: z.array(id).max(30) }).strict()).min(1).max(2048),
  flowers: z.array(point.extend({ color }).strict()).max(2000) }).strict();
const worldSchema = z.object({ schemaVersion: z.literal(1), generatorVersion: z.literal(1), id: townIdSchema, streamerTwitchUserId: twitchId,
  name: nameSchema, seed: z.number().int().min(0).max(4294967295), layout: layoutSchema,
  districts: z.array(z.object({ id, name: z.string().min(1).max(100), kind: z.enum(["civic", "residential"]), plotIds: z.array(id).max(500),
    generation: z.object({ version: z.literal(1), index: z.number().int().min(1).max(40), seed: z.number().int().min(0).max(4294967295),
      x: point.shape.x, y: point.shape.y, width: z.literal(1600), height: z.literal(1120) }).strict().optional() }).strict()).max(100),
  plots: z.array(z.object({ id, districtId: id, position: point, entranceNodeId: id, buildingId: id.nullable() }).strict()).max(500),
  buildings: z.array(z.discriminatedUnion("kind", [z.object({ id, kind: z.literal("town-hall"), position: point }).strict(),
    z.object({ id, kind: z.literal("house"), position: point, plotId: id, ownerTwitchUserId: twitchId.nullable(), appearance: appearanceSchema, property: propertySchema.optional() }).strict()])).max(501),
  residents: z.array(z.object({ id, twitchUserId: twitchId, displayName: z.string().min(1).max(100), isFollower: z.boolean(), isSubscriber: z.boolean(),
    subscriptionMonths: z.number().int().min(0).max(10000), houseId: id.nullable(), housingStatus: z.enum(["none", "housed", "waiting"]), subscription: subscriptionSchema.optional() }).strict()).max(10000),
  mayor: mayorInputSchema.extend({ id, species: z.literal("cat"), headquartersId: id }),
  processedEvents: z.array(z.unknown()).length(0),
  giftGroups: z.array(z.object({ id: z.string().min(1).max(4096), gifter: z.object({ twitchUserId: twitchId, displayName: z.string().min(1).max(100) }).strict().nullable(),
    announcedCount: z.number().int().min(0).max(10000), recipientIds: z.array(twitchId).max(10000) }).strict()).max(10000),
  subscriberSync: syncSchema.optional(),
}).strict();
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new PersistenceError("invalid_input");
  return result.data;
}
export function validateWorld(input: unknown): TownWorld {
  if (!input || typeof input !== "object" || !("schemaVersion" in input) || input.schemaVersion !== 1
    || !("generatorVersion" in input) || input.generatorVersion !== 1) throw new PersistenceError("incompatible");
  const parsed = worldSchema.safeParse(input);
  if (!parsed.success || JSON.stringify(input).length > 1_000_000) throw new PersistenceError("incompatible");
  const world = parsed.data as TownWorld;
  const nodes = new Set(world.layout.navigation.map((node) => node.id));
  const graph = new Map(world.layout.navigation.map((node) => [node.id, node]));
  const connected = new Set<string>(["hall"]), queue = ["hall"];
  for (let i = 0; i < queue.length; i++) for (const neighbor of graph.get(queue[i])?.neighbors ?? []) {
    if (!connected.has(neighbor)) { connected.add(neighbor); queue.push(neighbor); }
  }
  const plots = new Map(world.plots.map((plot) => [plot.id, plot]));
  const buildings = new Map(world.buildings.map((building) => [building.id, building]));
  const districts = new Map(world.districts.map((district) => [district.id, district]));
  const residents = new Map(world.residents.map((resident) => [resident.twitchUserId, resident]));
  const ownerIds = world.buildings.flatMap((building) => building.kind === "house" && building.ownerTwitchUserId ? [building.ownerTwitchUserId] : []);
  if (!nodes.has("hall") || !nodes.has("1-2") || nodes.size !== world.layout.navigation.length || connected.size !== nodes.size
    || world.layout.navigation.some((node) => node.neighbors.some((id) => !graph.get(id)?.neighbors.includes(node.id)))
    || world.layout.navigation.some((node) => node.neighbors.some((id) => !nodes.has(id)))
    || world.seed !== world.layout.seed || plots.size !== world.plots.length || buildings.size !== world.buildings.length
    || districts.size !== world.districts.length || residents.size !== world.residents.length || new Set(ownerIds).size !== ownerIds.length
    || buildings.get(world.mayor.headquartersId)?.kind !== "town-hall"
    || world.plots.some((plot) => !nodes.has(plot.entranceNodeId) || !districts.get(plot.districtId)?.plotIds.includes(plot.id)
      || (plot.buildingId !== null && (buildings.get(plot.buildingId)?.kind !== "house"
        || (buildings.get(plot.buildingId) as { plotId: string }).plotId !== plot.id)))
    || world.districts.some((district) => district.plotIds.some((id) => plots.get(id)?.districtId !== district.id))
    || world.buildings.some((building) => building.kind === "house" && (plots.get(building.plotId)?.buildingId !== building.id
      || plots.get(building.plotId)?.position.x !== building.position.x || plots.get(building.plotId)?.position.y !== building.position.y
      || (building.ownerTwitchUserId !== null && residents.get(building.ownerTwitchUserId)?.houseId !== building.id)))
    || world.residents.some((resident) => resident.houseId !== null && (buildings.get(resident.houseId)?.kind !== "house"
      || (buildings.get(resident.houseId) as { ownerTwitchUserId: string | null }).ownerTwitchUserId !== resident.twitchUserId))) throw new PersistenceError("incompatible");
  return world;
}

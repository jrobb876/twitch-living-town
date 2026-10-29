import { randomUUID, randomInt } from "node:crypto";
import { z } from "zod";
import type { AccountProfile } from "../auth/types";
import { createWorld, createSession, housesIn } from "../simulation/world";
import { processEvent } from "../simulation/engine";
import type { TownWorld } from "../simulation/types";
import { PersistenceError, type PersistentTownRepository, type StoredTown, type DurableEvent, type HouseSettings } from "./types";
import { createTownSchema, mayorInputSchema, appearanceSchema, propertySchema, parseInput, townIdSchema, twitchId, validateWorld, subscriptionSchema, syncSchema } from "./validation";

const identity = z.object({ twitchUserId: twitchId, displayName: z.string().min(1).max(100) }).strict();
const eventBase = z.object({ id: z.string().min(1).max(4096), townId: townIdSchema, occurredAt: z.number().finite().min(0).max(8640000000000000) });
const gift = z.object({ groupId: z.string().min(1).max(4096), gifter: identity }).strict();
const durableEventSchema = z.discriminatedUnion("type", [
  eventBase.extend({ type: z.literal("NEW_FOLLOWER"), user: identity }).strict(),
  eventBase.extend({ type: z.literal("NEW_SUBSCRIBER"), user: identity, gift: gift.optional(), subscription: subscriptionSchema.extend({ active: z.literal(true) }).optional() }).strict(),
  eventBase.extend({ type: z.literal("RESUBSCRIPTION"), user: identity, cumulativeMonths: z.number().int().min(1).max(10000), subscription: subscriptionSchema.extend({ active: z.literal(true) }).optional() }).strict(),
  eventBase.extend({ type: z.literal("SUBSCRIPTION_ENDED"), user: identity, subscription: subscriptionSchema.extend({ active: z.literal(false) }) }).strict(),
  eventBase.extend({ type: z.literal("GIFT_SUBSCRIPTION"), groupId: z.string().min(1).max(4096), gifter: identity.nullable(), total: z.number().int().min(0).max(10000), recipients: z.array(identity).max(100) }).strict(),
]);

/** Orchestrates the existing simulation. The SQL transaction is the final authority on revisions/ownership. */
export class TownPersistenceService {
  constructor(private repository: PersistentTownRepository) {}
  mine(profile: AccountProfile) { return this.repository.findByOwner(profile.twitchUserId); }
  async saveSync(profile: AccountProfile, townId: string, input: unknown) {
    const sync = parseInput(syncSchema, input);
    for (let attempt = 0; attempt < 8; attempt++) {
      const town = await this.owned(profile, townId); town.world.subscriberSync = sync;
      const result = await this.repository.commit(profile.twitchUserId, town);
      if (result.status === "saved") return result.town;
    }
    throw new PersistenceError("conflict");
  }
  async ownHouse(profile: AccountProfile, townId: string) {
    const town = await this.repository.load(parseInput(townIdSchema, townId));
    if (!town) throw new PersistenceError("not_found");
    return housesIn(town.world).find((house) => house.ownerTwitchUserId === profile.twitchUserId) ?? null;
  }
  async owned(profile: AccountProfile, townId: string) {
    parseInput(townIdSchema, townId);
    const town = await this.repository.load(townId);
    if (!town || town.world.streamerTwitchUserId !== profile.twitchUserId) throw new PersistenceError("forbidden");
    return town;
  }
  async create(profile: AccountProfile, input: unknown) {
    const options = parseInput(createTownSchema, input);
    const world = createWorld({ id: randomUUID(), streamerTwitchUserId: profile.twitchUserId, seed: options.seed ?? randomInt(0, 4294967296), name: options.name, mayorName: options.mayorName });
    world.mayor.appearance = { preset: "default" }; world.mayor.personality = { curiosity: 0.5, energy: 0.5 };
    return this.repository.create(profile, world); // Unique owner + transaction makes retries idempotent.
  }
  async saveMayor(profile: AccountProfile, townId: string, revision: number, input: unknown) {
    const settings = parseInput(mayorInputSchema, input), town = await this.owned(profile, townId);
    if (town.revision !== revision) throw new PersistenceError("conflict");
    town.world.mayor = { ...town.world.mayor, ...settings };
    return this.save(profile, town);
  }
  /** V1 layout is written at creation. Saving it again cannot move existing homes/navigation. */
  async saveLayout(profile: AccountProfile, townId: string, revision: number, layout: TownWorld["layout"]) {
    const town = await this.owned(profile, townId);
    if (town.revision !== revision || JSON.stringify(town.world.layout) !== JSON.stringify(layout)) throw new PersistenceError("conflict");
    return this.save(profile, town);
  }
  async updateHouse(profile: AccountProfile, townId: string, houseId: string, revision: number, input: unknown) {
    const patch = parseInput(z.object({ appearance: appearanceSchema.optional(), customization: propertySchema.shape.customization.optional() }).strict(), input);
    const town = await this.owned(profile, townId);
    if (town.revision !== revision) throw new PersistenceError("conflict");
    const house = housesIn(town.world).find((item) => item.id === houseId);
    if (!house) throw new PersistenceError("not_found");
    if (patch.appearance) house.appearance = patch.appearance;
    if (patch.customization) house.property = { ...this.houseSettings(house.ownerTwitchUserId, house.property), customization: patch.customization };
    return this.save(profile, town);
  }
  /** Ownership check for future subscriber endpoints; active entitlement must ALSO be freshly verified before writes. */
  async assertHouseOwner(profile: AccountProfile, townId: string, houseId: string) {
    const town = await this.repository.load(parseInput(townIdSchema, townId));
    const house = town && housesIn(town.world).find((item) => item.id === houseId);
    if (!house || house.ownerTwitchUserId !== profile.twitchUserId) throw new PersistenceError("forbidden");
    return house;
  }
  private houseSettings(owner: string | null, property?: HouseSettings): HouseSettings {
    if (property) return owner && property.status === "unclaimed" ? { ...property, status: "verified_subscriber" } : property;
    return { size: "small", prestige: 0, status: owner ? "verified_subscriber" : "unclaimed", customization: {} };
  }
  private async save(profile: AccountProfile, town: StoredTown) {
    const result = await this.repository.commit(profile.twitchUserId, town);
    if (result.status !== "saved") throw new PersistenceError("conflict");
    return result.town;
  }
  /** SERVER ADAPTER ONLY. No HTTP endpoint exposes this; a future verified Twitch adapter must supply evidence.
   * This is not subscription verification. Synthetic/demo events must never call it. */
  async applyVerifiedEvent(input: { source: "twitch_verified"; event: DurableEvent }) {
    if (input.source !== "twitch_verified") throw new PersistenceError("invalid_input");
    const event = parseInput(durableEventSchema, input.event);
    for (let attempt = 0; attempt < 8; attempt++) {
      const town = await this.repository.load(event.townId);
      if (!town) throw new PersistenceError("not_found");
      const result = processEvent(createSession(town.world, event.occurredAt), event, event.occurredAt);
      if (result.outcome.status !== "applied") throw new PersistenceError("invalid_input");
      const world = result.state.world;
      world.processedEvents = []; // SQL's unique ledger is durable; no chat/outcome history in world responses.
      for (const house of housesIn(world)) if (house.ownerTwitchUserId && house.property?.status !== "legacy") house.property = this.houseSettings(house.ownerTwitchUserId, house.property);
      const saved = await this.repository.commit(world.streamerTwitchUserId, { ...town, world: validateWorld(world) },
        { id: event.id, type: event.type, source: input.source, occurredAt: event.occurredAt, outcome: result.outcome });
      if (saved.status !== "conflict") return { ...saved, presentation: saved.status === "saved"
        ? { effects: result.state.runtime.effects, tasks: result.state.runtime.mayor.tasks } : null }; // Temporary presentation is never saved.
    }
    throw new PersistenceError("conflict");
  }
  async publicTown(townId: string) {
    const town = await this.repository.load(parseInput(townIdSchema, townId));
    if (!town) throw new PersistenceError("not_found");
    const { world } = town;
    return { id: world.id, name: world.name, seed: world.seed, generatorVersion: world.generatorVersion, layout: world.layout,
      districts: world.districts, plots: world.plots, mayor: { name: world.mayor.name, species: world.mayor.species, appearance: world.mayor.appearance },
      buildings: world.buildings.map((building) => building.kind === "town-hall" ? building
        : { id: building.id, kind: building.kind, plotId: building.plotId, position: building.position, appearance: building.appearance }) };
  }
}

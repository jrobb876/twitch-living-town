import { randomUUID, randomInt } from "node:crypto";
import { communityImportSchema, type CommunityImport } from "../community/types";
import { z } from "zod";
import type { AccountProfile } from "../auth/types";
import { createWorld, createSession, housesIn } from "../simulation/world";
import { canCustomize, customizeHouse, exteriorSchema, houseVisual, type PropertyView } from "../houses/customization";
import { processEvent } from "../simulation/engine";
import type { TownWorld, TownEffect, MayorState } from "../simulation/types";
import { PersistenceError, isPersistenceError, type PersistentTownRepository, type StoredTown, type DurableEvent, type HouseSettings, type CommitResult } from "./types";
import { createTownSchema, mayorInputSchema, townSettingsSchema, appearanceSchema, propertySchema, parseInput, townIdSchema, twitchId, validateWorld, subscriptionSchema, syncSchema } from "./validation";

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
  /** Existing owner-checked CAS RPC stores progress in world JSON; no new table or public mutation surface. */
  async saveCommunityImport(profile: AccountProfile, townId: string, input: CommunityImport, now: number, claim = false) {
    const summary = parseInput(communityImportSchema, input);
    for (let attempt = 0; attempt < 8; attempt++) {
      const town = await this.owned(profile, townId), prior = town.world.communityImport;
      if (claim ? prior?.status === "running" && prior.leaseUntil > now
        : !prior || prior.id !== summary.id || prior.status !== "running" || prior.leaseUntil <= now) throw new PersistenceError("conflict");
      const result = await this.repository.commit(profile.twitchUserId, { ...town, world: { ...town.world, communityImport: summary } });
      if (result.status === "saved") return result.town;
    }
    throw new PersistenceError("conflict");
  }
  private propertyView(profile: AccountProfile, town: StoredTown, houseId: string): PropertyView {
    const house = housesIn(town.world).find((item) => item.id === houseId && item.ownerTwitchUserId === profile.twitchUserId);
    if (!house) throw new PersistenceError("forbidden");
    return { townId: town.world.id, townName: town.world.name, streamerTwitchUserId: town.world.streamerTwitchUserId, revision: town.revision, house,
      ownerName: profile.displayName, editable: canCustomize(town.world, house, profile.twitchUserId) };
  }
  async listOwnProperties(profile: AccountProfile) {
    const result: PropertyView[] = [];
    for (const id of await this.repository.ownedTownIds(profile.twitchUserId)) {
      const town = await this.repository.load(id);
      const house = town && housesIn(town.world).find((item) => item.ownerTwitchUserId === profile.twitchUserId);
      if (town && house) result.push(this.propertyView(profile, town, house.id));
    }
    return result;
  }
  async ownProperty(profile: AccountProfile, townId: string, houseId: string) {
    const town = await this.repository.load(parseInput(townIdSchema, townId));
    if (!town) throw new PersistenceError("not_found");
    return this.propertyView(profile, town, houseId);
  }
  async saveOwnExterior(profile: AccountProfile, townId: string, houseId: string, revision: number, input: unknown,
    verify: (broadcasterId: string, userId: string) => Promise<void>) {
    const draft = parseInput(exteriorSchema, input);
    parseInput(z.number().int().positive().max(Number.MAX_SAFE_INTEGER), revision);
    const town = await this.repository.load(parseInput(townIdSchema, townId));
    if (!town) throw new PersistenceError("not_found");
    const property = this.propertyView(profile, town, houseId);
    if (!property.editable) throw new PersistenceError("forbidden");
    if (town.revision !== revision) throw new PersistenceError("conflict");
    await verify(town.world.streamerTwitchUserId, profile.twitchUserId);
    town.world.buildings = town.world.buildings.map((item) => item.kind === "house" && item.id === houseId ? customizeHouse(item, draft) : item);
    // The existing transaction CAS rejects a simultaneous subscription end, save or allocation.
    const saved = await this.repository.commit(town.world.streamerTwitchUserId, town);
    if (saved.status !== "saved") throw new PersistenceError("conflict");
    return this.propertyView(profile, saved.town, houseId);
  }
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
    world.mayor.appearance = options.mayorAppearance ?? { preset: "default" }; world.mayor.personality = options.mayorPersonality ?? { curiosity: 0.5, energy: 0.5 };
    return this.repository.create(profile, world); // Unique owner + transaction makes retries idempotent.
  }
  async saveMayor(profile: AccountProfile, townId: string, revision: number, input: unknown) {
    const settings = parseInput(mayorInputSchema, input), town = await this.owned(profile, townId);
    if (town.revision !== revision) throw new PersistenceError("conflict");
    town.world.mayor = { ...town.world.mayor, ...settings };
    return this.save(profile, town);
  }
  async saveSettings(profile: AccountProfile, townId: string, revision: number, input: unknown) {
    const settings = parseInput(townSettingsSchema, input);
    parseInput(z.number().int().positive().max(Number.MAX_SAFE_INTEGER), revision);
    const town = await this.owned(profile, townId);
    if (town.revision !== revision) throw new PersistenceError("conflict");
    town.world.name = settings.name;
    town.world.mayor = { ...town.world.mayor, ...settings.mayor };
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
  async applyVerifiedEvent(input: { source: "twitch_verified"; event: DurableEvent; historical?: boolean }, allowExpansion = true): Promise<CommitResult & {
    expansionDeferred: boolean; presentation: { effects: TownEffect[]; tasks: MayorState["tasks"] } | null;
  }> {
    if (input.source !== "twitch_verified") throw new PersistenceError("invalid_input");
    const event = parseInput(durableEventSchema, input.event);
    for (let attempt = 0; attempt < 8; attempt++) {
      const town = await this.repository.load(event.townId);
      if (!town) throw new PersistenceError("not_found");
      const result = processEvent(createSession(town.world, event.occurredAt), event, event.occurredAt, { allowExpansion, historical: input.historical });
      if (result.outcome.status !== "applied") throw new PersistenceError("invalid_input");
      const world = result.state.world;
      world.processedEvents = []; // SQL's unique ledger is durable; no chat/outcome history in world responses.
      for (const house of housesIn(world)) if (house.ownerTwitchUserId && house.property?.status !== "legacy") house.property = this.houseSettings(house.ownerTwitchUserId, house.property);
      try {
        if (!allowExpansion) result.outcome.message += " Neighborhood expansion deferred; retry subscriber sync.";
        const saved = await this.repository.commit(world.streamerTwitchUserId, { ...town, world: validateWorld(world) },
          { id: event.id, type: event.type, source: input.source, occurredAt: event.occurredAt, outcome: result.outcome });
        if (saved.status !== "conflict") return { ...saved, outcome: saved.status === "saved" ? result.outcome : saved.outcome,
          expansionDeferred: !allowExpansion && saved.status === "saved", presentation: saved.status === "saved" && !input.historical
          ? { effects: result.state.runtime.effects, tasks: result.state.runtime.mayor.tasks } : null };
      } catch (error) {
        // SQL failures roll back; an ambiguous network response may have committed.
        // Re-read and let the receipt resolve that ambiguity before preserving verified
        // membership using existing capacity, or waitlisting it. A full outage still throws
        // and is retried by the verified event queue; never claim a successful memory save.
        if (allowExpansion && world.plots.length > town.world.plots.length && isPersistenceError(error) && error.code !== "forbidden")
          return this.applyVerifiedEvent(input, false);
        throw error;
      }
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
        : { id: building.id, kind: building.kind, plotId: building.plotId, position: building.position, appearance: building.appearance,
          exterior: (({ name, door, fence, garden, accent }) => ({ name, door, fence, garden, accent }))(houseVisual(building)) }) };
  }
}

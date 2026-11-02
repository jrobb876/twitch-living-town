import { createHash } from "node:crypto";
import type { AccountProfile } from "../auth/types";
import { PersistenceError } from "../persistence/types";
import { processEvent } from "../simulation/engine";
import { createSession, createWorld, housesIn } from "../simulation/world";
import type { TownWorld } from "../simulation/types";
import { customizeHouse, type ExteriorDraft, type PropertyView } from "./customization";

export const MAPLEBROOK_ID = "demo-maplebrook";
export const subscriberDemoEnabled = (env: Record<string, string | undefined> = process.env) => env.NODE_ENV === "development" && env.TOWN_DEMO_MODE === "true" && env.PUBLIC_DEPLOYMENT !== "true";
const TTL = 8 * 60 * 60 * 1000;
type Entry = { world: TownWorld; owner: string; revision: number; expiresAt: number };

export function maplebrook(profile: AccountProfile): TownWorld {
  let state = createSession(createWorld({ id: MAPLEBROOK_ID, streamerTwitchUserId: "fictional-maplebrooklive", seed: 211101,
    name: "Maplebrook", mayorName: "Maple" }));
  // The viewer receives the thirteenth allocation: construction after the starter cottages.
  for (let i = 0; i < 15; i++) state = processEvent(state, { id: `maplebrook-sub-${i}`, townId: MAPLEBROOK_ID, occurredAt: 0, type: "NEW_SUBSCRIBER",
    user: i === 12 ? { twitchUserId: profile.twitchUserId, displayName: profile.displayName }
      : { twitchUserId: `fictional-maplebrook-${i}`, displayName: `Maple Neighbor ${i + 1}` } }, 0, { allowExpansion: true, historical: true }).state;
  return state.world;
}

/** Isolated per-login memory, with no repository, Twitch gateway or persistence dependency. */
export class SubscriberDemoStore {
  private entries = new Map<string, Entry>();
  constructor(private enabled = () => subscriberDemoEnabled(), private now = Date.now) {}
  private key(session: string) {
    if (!this.enabled()) throw new PersistenceError("not_found");
    if (!session) throw new PersistenceError("forbidden");
    for (const [key, value] of this.entries) if (value.expiresAt <= this.now()) this.entries.delete(key);
    return createHash("sha256").update(session).digest("hex");
  }
  private entry(session: string, profile: AccountProfile) {
    const entry = this.entries.get(this.key(session));
    if (entry && entry.owner !== profile.twitchUserId) throw new PersistenceError("forbidden");
    return entry;
  }
  read(session: string, profile: AccountProfile) {
    const entry = this.entry(session, profile);
    if (!entry) return null;
    const house = housesIn(entry.world).find((h) => h.ownerTwitchUserId === profile.twitchUserId);
    if (!house) throw new PersistenceError("not_found");
    const property: PropertyView = { townId: MAPLEBROOK_ID, townName: "Maplebrook", streamerTwitchUserId: entry.world.streamerTwitchUserId,
      streamerName: "MaplebrookLive (fictional)", revision: entry.revision, house, ownerName: profile.displayName, editable: true, simulated: true };
    return structuredClone({ world: entry.world, property });
  }
  activate(session: string, profile: AccountProfile, reset = false) {
    const current = this.entry(session, profile);
    if (!current || reset) {
      if (!current && this.entries.size >= 50) throw new PersistenceError("unavailable");
      this.entries.set(this.key(session), { owner: profile.twitchUserId, world: maplebrook(profile), revision: (current?.revision ?? 0) + 1, expiresAt: this.now() + TTL });
    }
    return this.read(session, profile)!;
  }
  save(session: string, profile: AccountProfile, houseId: string, revision: number, exterior: ExteriorDraft) {
    const entry = this.entry(session, profile), current = this.read(session, profile);
    if (!entry || !current) throw new PersistenceError("not_found");
    if (current.property.house.id !== houseId) throw new PersistenceError("forbidden");
    if (entry.revision !== revision) throw new PersistenceError("conflict");
    entry.world = { ...entry.world, buildings: entry.world.buildings.map((house) => house.id === houseId ? customizeHouse(current.property.house, exterior) : house) };
    entry.revision++;
    return this.read(session, profile)!;
  }
}

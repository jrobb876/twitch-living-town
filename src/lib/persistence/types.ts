import type { TownWorld, TownEvent, EventOutcome, HouseBuilding } from "../simulation/types";
import type { AccountProfile } from "../auth/types";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type StoredTown = { world: TownWorld; revision: number; updatedAt: string };
export type DurableEvent = Exclude<TownEvent, { type: "CHAT_MESSAGE" | "INCOMING_RAID" }>;
export type EventReceipt = { id: string; type: DurableEvent["type"]; source: "twitch_verified"; occurredAt: number; outcome: EventOutcome };
export type CommitResult = { status: "saved" | "conflict" | "duplicate"; town: StoredTown; outcome?: EventOutcome };
export interface PersistentTownRepository {
  ownedTownIds(userId: string): Promise<string[]>;
  findByOwner(ownerId: string): Promise<StoredTown | null>;
  load(townId: string): Promise<StoredTown | null>;
  create(profile: AccountProfile, world: TownWorld): Promise<StoredTown>;
  commit(ownerId: string, town: StoredTown, receipt?: EventReceipt): Promise<CommitResult>;
}
export type HouseSettings = NonNullable<HouseBuilding["property"]>;
export type MayorSettings = TownWorld["mayor"];
export const persistenceMessages = {
  configuration: "Persistent towns are not configured. Set the server Supabase variables and apply the migration. The demo remains available.",
  unavailable: "Town storage is unavailable. No save was confirmed. Please retry; the demo is separate from your saved town.",
  migration: "Town storage needs the documented database migration before it can be used.",
  invalid_input: "Please check the town settings. The request contains invalid or unsupported values.",
  forbidden: "You do not have permission to update this town or property.",
  not_found: "This town does not exist.",
  conflict: "The town changed while saving. Reload it and try again.",
  incompatible: "This saved town requires a supported world migration. It has not been regenerated or overwritten.",
} as const;
export type PersistenceCode = keyof typeof persistenceMessages;
export class PersistenceError extends Error {
  constructor(readonly code: PersistenceCode) { super(code); this.name = "PersistenceError"; }
}
export function isPersistenceError(error: unknown): error is PersistenceError {
  return !!error && typeof error === "object" && "name" in error && error.name === "PersistenceError"
    && "code" in error && typeof error.code === "string" && Object.hasOwn(persistenceMessages, error.code);
}

import type { AccountProfile } from "../auth/types";
import type { TownWorld } from "../simulation/types";
import { PersistenceError, isPersistenceError, type PersistentTownRepository, type StoredTown, type EventReceipt, type CommitResult, type Json } from "./types";
import { validateWorld, parseInput, townIdSchema } from "./validation";

export type RpcName = "living_town_load" | "living_town_create" | "living_town_commit" | "living_town_owned_towns";
export type RpcClient = (name: RpcName, args: Record<string, Json>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
function stored(value: unknown): StoredTown {
  const row = value as Partial<StoredTown> | null;
  if (!row || !Number.isSafeInteger(row.revision) || row.revision! < 1 || typeof row.updatedAt !== "string") throw new PersistenceError("incompatible");
  return { world: validateWorld(row.world), revision: row.revision!, updatedAt: row.updatedAt };
}
const json = (value: unknown): Json => JSON.parse(JSON.stringify(value));
export class SupabaseTownRepository implements PersistentTownRepository {
  constructor(private rpc: RpcClient) {}
  async ownedTownIds(userId: string) { return parseInput(townIdSchema.array(), await this.call("living_town_owned_towns", { p_user: userId })); }
  private async call(name: RpcName, args: Record<string, Json>): Promise<unknown> {
    try {
      const { data, error } = await this.rpc(name, args);
      if (error) {
        const code = error.code;
        throw new PersistenceError(["PGRST202", "42P01", "42883"].includes(code ?? "") ? "migration"
          : code === "LT403" ? "forbidden" : code === "LT409" || code === "23505" ? "conflict"
          : code === "LT400" || code === "23514" || code === "23503" ? "invalid_input" : "unavailable");
      }
      return data;
    } catch (error) {
      const safe = isPersistenceError(error) ? error : new PersistenceError("unavailable");
      console.warn(JSON.stringify({ event: "town_storage", operation: name, category: safe.code }));
      throw safe;
    }
  }
  async findByOwner(ownerId: string) { const data = await this.call("living_town_load", { p_owner: ownerId }); return data === null ? null : stored(data); }
  async load(townId: string) { const data = await this.call("living_town_load", { p_id: townId }); return data === null ? null : stored(data); }
  async create(profile: AccountProfile, world: TownWorld) {
    return stored(await this.call("living_town_create", { p_profile: json(profile), p_world: json(validateWorld(world)) }));
  }
  async commit(ownerId: string, town: StoredTown, receipt?: EventReceipt): Promise<CommitResult> {
    const data = await this.call("living_town_commit", { p_owner: ownerId, p_world: json(validateWorld(town.world)), p_revision: town.revision, p_event: receipt ? json(receipt) : null });
    const result = data as CommitResult;
    if (!result || !["saved", "conflict", "duplicate"].includes(result.status)) throw new PersistenceError("incompatible");
    return { status: result.status, town: stored(result.town), ...(result.outcome ? { outcome: result.outcome } : {}) };
  }
}

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { RpcClient } from "../persistence/repository";
import type { TownPersistenceService } from "../persistence/service";
import { PersistenceError, isPersistenceError, type Json } from "../persistence/types";
import { parseInput, townIdSchema, validateWorld } from "../persistence/validation";
import type { AccountProfile } from "../auth/types";
import { displaySchema, overlayWorld, type OverlayActivity } from "./model";
import type { OverlayReaction } from "./reactions";
import { OverlayPopulationProjector, type OverlayPopulation } from "./population";

export const displayActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), townId: townIdSchema, settings: displaySchema }).strict(),
  z.object({ action: z.enum(["rotate", "revoke"]), townId: townIdSchema }).strict(),
]);
const statusSchema = z.object({ settings: displaySchema, enabled: z.boolean() });
export const hashOverlayToken = (token: string) => createHash("sha256").update(token).digest("hex");
export class OverlayService {
  private population = new OverlayPopulationProjector();
  constructor(private rpc: RpcClient, private towns: TownPersistenceService,
    private activity: (owner: string) => OverlayActivity,
    private reactions: (owner: string, townId: string) => OverlayReaction[]) {}
  private async call(name: "living_town_display_manage" | "living_town_display_read", args: Record<string, Json>) {
    try {
      const result = await this.rpc(name, args);
      if (result.error) throw new PersistenceError(result.error.code === "LT403" ? "forbidden"
        : ["PGRST202", "42P01", "42883"].includes(result.error.code ?? "") ? "migration"
        : ["LT400", "23514"].includes(result.error.code ?? "") ? "invalid_input" : "unavailable");
      return result.data;
    } catch (error) { throw isPersistenceError(error) ? error : new PersistenceError("unavailable"); }
  }
  async status(profile: AccountProfile, townId: string) {
    await this.towns.owned(profile, parseInput(townIdSchema, townId));
    return parseInput(statusSchema, await this.call("living_town_display_manage", { p_id: townId, p_owner: profile.twitchUserId, p_action: "status" }));
  }
  async manage(profile: AccountProfile, input: unknown) {
    const body = parseInput(displayActionSchema, input);
    await this.towns.owned(profile, body.townId);
    const token = body.action === "rotate" ? randomBytes(32).toString("base64url") : undefined;
    const status = parseInput(statusSchema, await this.call("living_town_display_manage", { p_id: body.townId, p_owner: profile.twitchUserId,
      p_action: body.action, p_settings: body.action === "save" ? body.settings : null, p_hash: token ? hashOverlayToken(token) : null }));
    return { ...status, ...(token ? { token } : {}) };
  }
  async read(townId: string, token: string, revision: number | null) {
    parseInput(townIdSchema, townId);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PersistenceError("forbidden");
    const row = await this.call("living_town_display_read", { p_id: townId, p_hash: hashOverlayToken(token) }) as { world?: unknown; revision?: number; settings?: unknown } | null;
    if (!row || !Number.isSafeInteger(row.revision)) throw new PersistenceError("incompatible");
    const world = validateWorld(row.world);
    if (world.id !== townId) throw new PersistenceError("forbidden");
    return { townId, revision: row.revision!, settings: parseInput(displaySchema, row.settings),
      ...(revision !== row.revision ? { world: overlayWorld(world) } : {}),
      population: this.population.project(world),
      activity: this.activity(world.streamerTwitchUserId), reactions: this.reactions(world.streamerTwitchUserId, townId) };
  }
}
// Optional at the playback boundary for an already-open client receiving an older server response.
export type OverlaySnapshot = Omit<Awaited<ReturnType<OverlayService["read"]>>, "population"> & { population?: OverlayPopulation };

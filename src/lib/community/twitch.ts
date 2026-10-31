import { z } from "zod";
import { AuthError } from "../auth/types";
import { HousingError } from "../subscribers/types";

export type VerifiedFollower = { twitchUserId: string; displayName: string };
const pageSchema = z.object({ total: z.number().int().nonnegative(), data: z.array(z.object({
  user_id: z.string().regex(/^\d{1,30}$/), user_name: z.string().trim().min(1).max(100), followed_at: z.iso.datetime(),
})).max(100), pagination: z.object({ cursor: z.string().min(1).max(4096).optional() }) });

/** Bounded retries; tokens, cursors and upstream bodies never enter diagnostics. */
export class TwitchFollowers {
  private resumeAt = 0;
  constructor(private clientId: string, private request: typeof fetch = fetch,
    private wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), private now = Date.now) {}
  async page(token: string, broadcasterId: string, cursor?: string): Promise<{ followers: VerifiedFollower[]; total: number; cursor?: string }> {
    const url = new URL("https://api.twitch.tv/helix/channels/followers");
    url.searchParams.set("broadcaster_id", broadcasterId); url.searchParams.set("first", "100");
    if (cursor) url.searchParams.set("after", cursor);
    for (let attempt = 0; attempt < 4; attempt++) {
      const delay = Math.max(0, this.resumeAt - this.now());
      if (delay > 30000) throw new HousingError("rate_limited");
      if (delay) await this.wait(delay);
      let response: Response;
      try { response = await this.request(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${token}`, "Client-Id": this.clientId } }); }
      catch { if (attempt === 3) throw new HousingError("unavailable"); await this.wait(1000 * 2 ** attempt); continue; }
      const reset = Number(response.headers.get("ratelimit-reset")) * 1000;
      if (response.headers.get("ratelimit-remaining") === "0" && Number.isFinite(reset)) this.resumeAt = reset;
      if (response.status === 401) throw new AuthError("invalid_token");
      if (response.status === 403) throw new AuthError("follower_scope");
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 3) throw new HousingError(response.status === 429 ? "rate_limited" : "unavailable");
        const retry = Number(response.headers.get("retry-after")) * 1000;
        const pause = Math.max(1000 * 2 ** attempt, Number.isFinite(retry) ? retry : 0, Number.isFinite(reset) ? reset - this.now() : 0);
        if (pause > 30000) throw new HousingError("rate_limited");
        await this.wait(pause); continue;
      }
      if (!response.ok) throw new HousingError("unsupported");
      let parsed: z.infer<typeof pageSchema>;
      try { parsed = pageSchema.parse(await response.json()); } catch { throw new HousingError("invalid_response"); }
      // Twitch may expose only a total when identities are not authorized.
      if (!parsed.data.length && (parsed.total > 0 || parsed.pagination.cursor)) throw new HousingError("invalid_response");
      return { total: parsed.total, cursor: parsed.pagination.cursor,
        followers: parsed.data.map((r) => ({ twitchUserId: r.user_id, displayName: r.user_name })) };
    }
    throw new HousingError("unavailable");
  }
}

import { z } from "zod";
import { AuthError } from "../auth/types";
import { authErrorCategory } from "../auth/diagnostics";
import { HousingError, type VerifiedSubscriber } from "./types";

const row = z.object({ broadcaster_id: z.string().regex(/^\d{1,30}$/), user_id: z.string().regex(/^\d{1,30}$/),
  user_name: z.string().min(1).max(100), tier: z.enum(["1000", "2000", "3000"]), is_gift: z.boolean() });
const page = z.object({ data: z.array(row).max(100), pagination: z.object({ cursor: z.string().min(1).max(4096).optional() }) });
/** Uses the existing validated/refreshed user token; never retains a token or upstream body. */
export class TwitchSubscriptions {
  constructor(private clientId: string, private request: typeof fetch = fetch) {}
  async page(accessToken: string, broadcasterId: string, cursor?: string, userId?: string): Promise<{ subscribers: VerifiedSubscriber[]; cursor?: string }> {
    const url = new URL("https://api.twitch.tv/helix/subscriptions");
    url.searchParams.set("broadcaster_id", broadcasterId); url.searchParams.set("first", "100");
    if (cursor) url.searchParams.set("after", cursor);
    if (userId) url.searchParams.set("user_id", userId);
    let response: Response;
    try { response = await this.request(url, { headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": this.clientId }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) }); }
    catch (error) {
      console.warn(JSON.stringify({ event: "twitch_housing", operation: "subscriber_page", category: authErrorCategory(error) }));
      throw new HousingError("unavailable");
    }
    if (!response.ok) {
      console.warn(JSON.stringify({ event: "twitch_housing", operation: "subscriber_page", httpStatus: response.status }));
      if (response.status === 401) throw new AuthError("invalid_token");
      throw new HousingError(response.status === 429 ? "rate_limited" : [400,403,422].includes(response.status) ? "unsupported" : "unavailable");
    }
    let data: z.infer<typeof page>;
    try { data = page.parse(await response.json()); } catch { throw new HousingError("invalid_response"); }
    if (data.data.some((item) => item.broadcaster_id !== broadcasterId || (userId && item.user_id !== userId))
      || (userId && data.pagination.cursor)) throw new HousingError("invalid_response");
    return { subscribers: data.data.map((item) => ({ twitchUserId: item.user_id, displayName: item.user_name, tier: item.tier, isGift: item.is_gift })), cursor: data.pagination.cursor };
  }
}

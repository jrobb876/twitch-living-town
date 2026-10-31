import { z } from "zod";

const count = z.number().int().min(0).max(100000);
export const communityImportSchema = z.object({ id: z.uuid(), status: z.enum(["running", "complete", "partial", "failed"]),
  phase: z.enum(["followers", "subscribers", "finished"]), startedAt: z.number().nonnegative(), updatedAt: z.number().nonnegative(),
  leaseUntil: z.number().nonnegative(), finishedAt: z.number().nonnegative().nullable(),
  followersDiscovered: count, subscribersDiscovered: count, uniqueResidentsImported: count, subscriberHousesAssigned: count,
  pages: count, error: z.string().max(40).nullable() }).strict();
export type CommunityImport = z.infer<typeof communityImportSchema>;
export const IMPORT_LEASE_MS = 5 * 60_000;
export const communityMessages: Record<string, string> = {
  busy: "A community import is already running. Its progress is retained.",
  unavailable: "Import could not be completed. Previously saved residents and houses are retained; retry when the service recovers.",
  interrupted: "The import was interrupted. Retry after its previous worker lease expires.",
  rate_limited: "Twitch rate limited this import. Saved progress is retained; retry after the rate limit resets.",
  unsupported: "Twitch did not permit access to this channel's membership. Check broadcaster permissions and subscriber availability.",
  invalid_response: "Twitch returned incomplete or inconsistent community data. Import was not marked complete.",
  capacity: "This import reached a processing or town capacity limit. Existing progress is retained; the import is incomplete.",
  conflict: "The import worker lost ownership or the town changed repeatedly. Reload progress before retrying.",
};

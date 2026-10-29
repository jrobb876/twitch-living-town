import { AuthError } from "../auth/types";
import type { AuthService } from "../auth/service";
import type { TownPersistenceService } from "./service";
import { PersistenceError } from "./types";

/** No browser-provided owner or town ID. Reading this never creates a town. */
export async function streamerAccess(auth: AuthService, persistence: () => TownPersistenceService, sessionId: string | undefined) {
  const profile = await auth.getProfile(sessionId, true);
  if (!profile || !sessionId) throw new AuthError("unauthorized");
  const town = await persistence().mine(profile);
  if (town && town.world.streamerTwitchUserId !== profile.twitchUserId) throw new PersistenceError("forbidden");
  return { town, csrfToken: auth.csrfToken(sessionId), destination: town ? "/dashboard" as const : "/onboarding" as const };
}

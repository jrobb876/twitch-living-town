import { AuthError, type AccountProfile } from "../auth/types";
import type { AuthService } from "../auth/service";
import type { TownPersistenceService } from "./service";
import type { PropertyView } from "../houses/customization";
import { attributeProperties } from "../houses/attribution";
import { PersistenceError, type StoredTown } from "./types";

export type DashboardData = {
  profile: AccountProfile; csrfToken: string; town: StoredTown | null; houses: PropertyView[];
  townUnavailable: boolean; housesUnavailable: boolean;
};
/** Authenticate before any private lookup. Failures remain distinct from empty collections. */
export async function dashboardAccess(auth: AuthService, persistence: () => TownPersistenceService, sessionId?: string): Promise<DashboardData> {
  const profile = await auth.getProfile(sessionId, true);
  if (!profile || !sessionId) throw new AuthError("unauthorized");
  const [town, houses] = await Promise.allSettled([
    Promise.resolve().then(async () => {
      const value = await persistence().mine(profile);
      if (value && value.world.streamerTwitchUserId !== profile.twitchUserId) throw new PersistenceError("forbidden");
      return value;
    }),
    Promise.resolve().then(async () => attributeProperties(auth, await persistence().listOwnProperties(profile))),
  ]);
  return { profile, csrfToken: auth.csrfToken(sessionId), town: town.status === "fulfilled" ? town.value : null,
    houses: houses.status === "fulfilled" ? houses.value : [], townUnavailable: town.status === "rejected", housesUnavailable: houses.status === "rejected" };
}

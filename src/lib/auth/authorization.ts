import { AuthError, type AccountProfile } from "./types";
import type { TownRepository } from "../simulation/repository";

/** Ownership comes from a trusted server repository, never a role/owner ID in a request. */
export function assertTownOwner(profile: AccountProfile | null, townId: string, repository: Pick<TownRepository, "load">): AccountProfile {
  if (!profile) throw new AuthError("unauthorized");
  const town = repository.load(townId);
  if (!town || town.streamerTwitchUserId !== profile.twitchUserId) throw new AuthError("forbidden");
  return profile;
}

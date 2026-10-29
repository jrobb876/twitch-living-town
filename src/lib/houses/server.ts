import "server-only";
import { getAuthService } from "../auth/server";
import { getTownPersistence } from "../persistence/server";
import { TwitchSubscriptions } from "../subscribers/twitch";
import { createHouseHandlers } from "./http";
import { membershipVerifier } from "./verification";
async function verify(broadcasterId: string, userId: string) {
  const auth = getAuthService();
  await membershipVerifier(auth, new TwitchSubscriptions(auth.config.clientId))(broadcasterId, userId);
}
export const houseHandlers = createHouseHandlers(getAuthService, getTownPersistence, verify, process.env.NODE_ENV === "production");

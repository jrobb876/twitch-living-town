import type { AuthService } from "../auth/service";
import { PersistenceError, isPersistenceError } from "../persistence/types";
import { isAuthError } from "../auth/types";
import type { TwitchSubscriptions } from "../subscribers/twitch";
export function membershipVerifier(auth: AuthService, twitch: TwitchSubscriptions) {
  return async (broadcasterId: string, userId: string) => {
    let key: string | undefined;
    try {
      const credentials = await auth.subscriptionCredentialsFor(broadcasterId); key = credentials.key;
      const result = await twitch.page(credentials.accessToken, broadcasterId, undefined, userId);
      if (!result.subscribers.some((user) => user.twitchUserId === userId)) throw new PersistenceError("forbidden");
    } catch (error) {
      if (isAuthError(error) && error.code === "invalid_token" && key) auth.revokeChat(key);
      if (isPersistenceError(error)) throw error;
      throw new PersistenceError("unavailable");
    }
  };
}

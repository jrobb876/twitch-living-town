import "server-only";
import { parseAuthConfig } from "./config";
import { AuthService } from "./service";
import { TwitchClient } from "./twitch";
import { assertTownOwner } from "./authorization";
import type { TownRepository } from "../simulation/repository";

const globalAuth = globalThis as typeof globalThis & {
  livingTownAuth?: { service: AuthService; timer: ReturnType<typeof setInterval> };
};

export function getAuthService(): AuthService {
  if (!globalAuth.livingTownAuth) {
    const config = parseAuthConfig(process.env);
    const service = new AuthService(config, new TwitchClient(config));
    const timer = setInterval(() => { void service.maintain(); }, 60_000);
    timer.unref();
    globalAuth.livingTownAuth = { service, timer };
  }
  return globalAuth.livingTownAuth.service;
}

export async function initializeAuth() {
  // No persisted sessions survive process startup. On HMR/startup re-entry,
  // force verification of any sessions already held by this process.
  try { await getAuthService().maintain(true); } catch { /* Missing configuration leaves the town usable. Login reports a safe error. */ }
}

export async function requireTownOwner(sessionId: string | undefined, townId: string, repository: Pick<TownRepository, "load">) {
  const profile = await getAuthService().getProfile(sessionId, true);
  return assertTownOwner(profile, townId, repository);
}

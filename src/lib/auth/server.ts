import "server-only";
import { parseAuthConfig, authStorageMode } from "./config";
import { DurableAuthStore } from "./durable-store";
import { getTownRpc } from "../persistence/server";
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
    const store = authStorageMode(config, process.env.AUTH_STORAGE) === "supabase" ? new DurableAuthStore(getTownRpc()) : undefined;
    const service = new AuthService(config, new TwitchClient(config), store);
    const timer = setInterval(() => { void service.maintain().catch(() => {}); }, 60_000);
    timer.unref();
    globalAuth.livingTownAuth = { service, timer };
  }
  return globalAuth.livingTownAuth.service;
}

export async function initializeAuth() {
  // Recovered encrypted sessions are validated before use and periodically afterward.
  try { await getAuthService().maintain(true); } catch { /* Missing configuration leaves the town usable. Login reports a safe error. */ }
}

export async function requireTownOwner(sessionId: string | undefined, townId: string, repository: Pick<TownRepository, "load">) {
  const profile = await getAuthService().getProfile(sessionId, true);
  return assertTownOwner(profile, townId, repository);
}

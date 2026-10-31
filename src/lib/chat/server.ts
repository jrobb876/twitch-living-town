import "server-only";
import { getAuthService } from "../auth/server";
import { ChatManager } from "./manager";
import { getSubscriberHousing } from "../subscribers/server";
import { getCommunityImport } from "../community/server";

// Process-wide ownership survives Next development module reloads and multiple tabs.
const runtime = globalThis as typeof globalThis & { livingTownChat?: { manager: ChatManager; timer: ReturnType<typeof setInterval> } };
export function getChatManager() {
  if (!runtime.livingTownChat) {
    const manager = new ChatManager(getAuthService(), undefined, undefined, undefined,
      { enqueue: (profile, key, value) => getSubscriberHousing().enqueue(profile, key, value), tick: () => getSubscriberHousing().tick() },
      { enqueue: (profile, key, value) => getCommunityImport().enqueue(profile, key, value), tick: () => getCommunityImport().tick() });
    const timer = setInterval(() => manager.tick(), 1000);
    timer.unref(); runtime.livingTownChat = { manager, timer };
  }
  return runtime.livingTownChat.manager;
}

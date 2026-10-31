import "server-only";
import { getAuthService } from "../auth/server";
import { getTownPersistence } from "../persistence/server";
import { getSubscriberHousing } from "../subscribers/server";
import { CommunityImportService } from "./service";
const runtime = globalThis as typeof globalThis & { livingTownCommunity?: CommunityImportService };
export function getCommunityImport() {
  return runtime.livingTownCommunity ??= new CommunityImportService(getAuthService(), getTownPersistence, getSubscriberHousing());
}

import "server-only";
import { getAuthService } from "../auth/server";
import { getTownPersistence } from "../persistence/server";
import { SubscriberHousingService } from "./service";
const runtime = globalThis as typeof globalThis & { livingTownHousing?: SubscriberHousingService };
export function getSubscriberHousing() { return runtime.livingTownHousing ??= new SubscriberHousingService(getAuthService(), getTownPersistence); }

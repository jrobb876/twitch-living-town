import { getAuthService } from "@/lib/auth/server";
import { getTownPersistence } from "@/lib/persistence/server";
import { getCommunityImport } from "@/lib/community/server";
import { getSubscriberHousing } from "@/lib/subscribers/server";
import { getChatManager } from "@/lib/chat/server";
import { CommunitySetup } from "@/lib/community/setup";
import { createSetupHandlers } from "@/lib/community/setup-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const shared = globalThis as typeof globalThis & { livingTownSetup?: CommunitySetup };
const handlers = createSetupHandlers(getAuthService, () => shared.livingTownSetup ??= new CommunitySetup(getAuthService(), getTownPersistence,
  getCommunityImport(), getSubscriberHousing(), getChatManager()), process.env.NODE_ENV === "production");
export const GET = handlers.status;
export const POST = handlers.control;

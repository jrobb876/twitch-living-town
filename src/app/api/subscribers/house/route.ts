import { createHousingHandlers } from "@/lib/subscribers/http";
import { getSubscriberHousing } from "@/lib/subscribers/server";
import { getAuthService } from "@/lib/auth/server";
import { getChatManager } from "@/lib/chat/server";
import { getTownPersistence } from "@/lib/persistence/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createHousingHandlers(getAuthService, getSubscriberHousing, getChatManager, getTownPersistence, process.env.NODE_ENV === "production").house;

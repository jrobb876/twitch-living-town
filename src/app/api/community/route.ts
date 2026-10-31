import { createCommunityHandlers } from "@/lib/community/http";
import { getCommunityImport } from "@/lib/community/server";
import { getAuthService } from "@/lib/auth/server";
import { getChatManager } from "@/lib/chat/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createCommunityHandlers(getAuthService, getCommunityImport, getChatManager, process.env.NODE_ENV === "production");
export const GET = handlers.status;
export const POST = handlers.control;

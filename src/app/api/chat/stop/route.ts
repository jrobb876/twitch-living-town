import { createChatHandlers } from "@/lib/chat/http";
import { getChatManager } from "@/lib/chat/server";
import { getAuthService } from "@/lib/auth/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createChatHandlers(getAuthService, getChatManager, process.env.NODE_ENV === "production").stop;

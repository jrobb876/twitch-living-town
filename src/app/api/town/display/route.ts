import { createOverlayHandlers } from "@/lib/overlay/http";
import { getOverlayService } from "@/lib/overlay/server";
import { getAuthService } from "@/lib/auth/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createOverlayHandlers(getAuthService, getOverlayService, process.env.NODE_ENV === "production");
export const GET = handlers.status;
export const POST = handlers.manage;

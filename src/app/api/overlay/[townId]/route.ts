import { createOverlayHandlers } from "@/lib/overlay/http";
import { getOverlayService } from "@/lib/overlay/server";
import { getAuthService } from "@/lib/auth/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createOverlayHandlers(getAuthService, getOverlayService, process.env.NODE_ENV === "production").read;

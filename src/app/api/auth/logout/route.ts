import { createAuthHandlers } from "@/lib/auth/http";
import { getAuthService } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createAuthHandlers(getAuthService, process.env.NODE_ENV === "production").logout;

import { getAuthService } from "@/lib/auth/server";
import { createHealthHandler } from "@/lib/security/health";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createHealthHandler(async () => { await getAuthService().ready(); });

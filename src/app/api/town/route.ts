import { createTownHandlers } from "@/lib/persistence/http";
import { getTownPersistence } from "@/lib/persistence/server";
import { getAuthService } from "@/lib/auth/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createTownHandlers(getAuthService, getTownPersistence, process.env.NODE_ENV === "production");
export const GET = handlers.get;
export const POST = handlers.create;
export const PATCH = handlers.mayor;

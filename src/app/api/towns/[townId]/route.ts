import { createTownHandlers } from "@/lib/persistence/http";
import { getTownPersistence } from "@/lib/persistence/server";
import { getAuthService } from "@/lib/auth/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createTownHandlers(getAuthService, getTownPersistence, process.env.NODE_ENV === "production").publicTown;

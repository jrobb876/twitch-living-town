import { houseHandlers } from "@/lib/houses/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = houseHandlers.list;

import type { NextRequest } from "next/server";
import { houseHandlers } from "@/lib/houses/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ townId: string; houseId: string }> };
export async function GET(request: NextRequest, context: Context) { return houseHandlers.get(request, await context.params); }
export async function PATCH(request: NextRequest, context: Context) { return houseHandlers.save(request, await context.params); }

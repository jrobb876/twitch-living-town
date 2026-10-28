import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AuthService } from "../auth/service";
import { AuthError, isAuthError } from "../auth/types";
import { cookieNames } from "../auth/config";
import { safeEqual } from "../auth/crypto";
import { isPersistenceError, PersistenceError, persistenceMessages } from "./types";
import { parseInput, townIdSchema, mayorInputSchema } from "./validation";
import type { TownPersistenceService } from "./service";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
function failure(error: unknown) {
  if (isAuthError(error)) return response({ error: error.code, message: error.code === "forbidden" ? "This request is not authorized." : "Connect your Twitch account to manage your town." }, error.code === "forbidden" ? 403 : 401);
  const code = isPersistenceError(error) ? error.code : "unavailable";
  return response({ error: code, message: persistenceMessages[code] }, code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "conflict" ? 409 : code === "invalid_input" ? 400 : 503);
}
/** Read a bounded stream, including requests without Content-Length. Never log its contents. */
async function input(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json") || Number(request.headers.get("content-length")) > 8192) throw new PersistenceError("invalid_input");
  const reader = request.body?.getReader();
  if (!reader) throw new PersistenceError("invalid_input");
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > 8192) { await reader.cancel(); throw new PersistenceError("invalid_input"); }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
  } catch { throw new PersistenceError("invalid_input"); }
  finally { reader.releaseLock(); }
}
export function createTownHandlers(authService: () => AuthService, persistence: () => TownPersistenceService, production: boolean) {
  async function identity(request: NextRequest, mutation = false) {
    const auth = authService(), sessionId = request.cookies.get(cookieNames(production).session)?.value;
    if (mutation && (request.nextUrl.origin !== auth.config.origin || request.headers.get("origin") !== auth.config.origin
      || request.headers.get("sec-fetch-site") === "cross-site")) throw new AuthError("forbidden");
    const profile = await auth.getProfile(sessionId, mutation);
    if (!profile || !sessionId) throw new AuthError("unauthorized");
    const csrfToken = auth.csrfToken(sessionId);
    if (mutation && !safeEqual(request.headers.get("x-csrf-token") ?? "", csrfToken)) throw new AuthError("forbidden");
    return { profile, csrfToken };
  }
  return {
    async get(request: NextRequest) {
      try { const { profile, csrfToken } = await identity(request); return response({ town: await persistence().mine(profile), csrfToken, storage: "supabase" }); }
      catch (error) { return failure(error); }
    },
    async create(request: NextRequest) {
      try {
        if (request.method !== "POST") throw new AuthError("forbidden");
        const { profile, csrfToken } = await identity(request, true);
        const town = await persistence().create(profile, await input(request));
        return response({ town, csrfToken, storage: "supabase" });
      } catch (error) { return failure(error); }
    },
    async mayor(request: NextRequest) {
      try {
        if (request.method !== "PATCH") throw new AuthError("forbidden");
        const { profile, csrfToken } = await identity(request, true);
        const body = parseInput(z.object({ townId: townIdSchema, revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), settings: mayorInputSchema }).strict(), await input(request));
        const town = await persistence().saveMayor(profile, body.townId, body.revision, body.settings);
        return response({ town, csrfToken, storage: "supabase" });
      } catch (error) { return failure(error); }
    },
    async publicTown(_request: NextRequest, context: { params: Promise<{ townId: string }> }) {
      try { return response({ town: await persistence().publicTown((await context.params).townId) }); }
      catch (error) { return failure(error); }
    },
  };
}

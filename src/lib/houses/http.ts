import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AuthService } from "../auth/service";
import type { TownPersistenceService } from "../persistence/service";
import { cookieNames } from "../auth/config";
import { safeEqual } from "../auth/crypto";
import { AuthError, isAuthError } from "../auth/types";
import { isPersistenceError, persistenceMessages } from "../persistence/types";
import { parseInput, townIdSchema } from "../persistence/validation";
import { readTownInput } from "../persistence/http";
import { exteriorSchema } from "./customization";
export const houseMessages = {
  unauthorized: "Sign in with Twitch to find your houses.",
  forbidden: "This property is read-only. Editing requires ownership and a verified active subscription.",
  verification: "Current membership could not be verified. The streamer must be connected to Living Town with Subscriber Housing authorized. No changes were saved.",
};
export function createHouseHandlers(authService: () => AuthService, persistence: () => TownPersistenceService,
  verify: (broadcasterId: string, userId: string) => Promise<void>, production: boolean) {
  function response(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer" } }); }
  function failure(error: unknown) {
    if (isAuthError(error)) return response({ error: error.code, message: error.code === "forbidden" ? houseMessages.forbidden : houseMessages.unauthorized }, error.code === "forbidden" ? 403 : 401);
    const code = isPersistenceError(error) ? error.code : "unavailable";
    return response({ error: code, message: code === "forbidden" ? houseMessages.forbidden : code === "unavailable" ? houseMessages.verification : persistenceMessages[code] },
      code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "conflict" ? 409 : code === "invalid_input" ? 400 : 503);
  }
  async function identity(request: NextRequest, mutation = false) {
    const auth = authService(), id = request.cookies.get(cookieNames(production).session)?.value;
    if (mutation && (request.method !== "PATCH" || request.nextUrl.origin !== auth.config.origin || request.headers.get("origin") !== auth.config.origin || request.headers.get("sec-fetch-site") === "cross-site")) throw new AuthError("forbidden");
    const profile = await auth.getProfile(id, mutation);
    if (!profile || !id) throw new AuthError("unauthorized");
    const csrfToken = auth.csrfToken(id);
    if (mutation && !safeEqual(request.headers.get("x-csrf-token") ?? "", csrfToken)) throw new AuthError("forbidden");
    return { profile, csrfToken };
  }
  const target = z.object({ townId: townIdSchema, houseId: z.string().min(1).max(256) }).strict();
  return {
    async list(request: NextRequest) {
      try { const { profile } = await identity(request); return response({ houses: await persistence().listOwnProperties(profile) }); }
      catch (error) { return failure(error); }
    },
    async get(request: NextRequest, params: { townId: string; houseId: string }) {
      try { const { profile, csrfToken } = await identity(request); const { townId, houseId } = parseInput(target, params);
        return response({ property: await persistence().ownProperty(profile, townId, houseId), csrfToken }); }
      catch (error) { return failure(error); }
    },
    async save(request: NextRequest, params: { townId: string; houseId: string }) {
      try { const { profile, csrfToken } = await identity(request, true); const { townId, houseId } = parseInput(target, params);
        const body = parseInput(z.object({ revision: z.number().int().positive(), exterior: exteriorSchema }).strict(), await readTownInput(request));
        return response({ property: await persistence().saveOwnExterior(profile, townId, houseId, body.revision, body.exterior, verify), csrfToken }); }
      catch (error) { return failure(error); }
    },
  };
}

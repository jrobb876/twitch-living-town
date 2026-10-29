import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookieNames, cookieOptions } from "../auth/config";
import { safeEqual } from "../auth/crypto";
import { AuthError, isAuthError, CHAT_SCOPE, SUBSCRIPTION_SCOPE, STATE_TTL_MS } from "../auth/types";
import { authMessages } from "../auth/messages";
import type { AuthService } from "../auth/service";
import type { ChatManager } from "../chat/manager";
import type { TownPersistenceService } from "../persistence/service";
import { isPersistenceError, persistenceMessages } from "../persistence/types";
import { parseInput } from "../persistence/validation";
import { readTownInput } from "../persistence/http";
import { HousingError, housingCode, housingMessages } from "./types";
import type { SubscriberHousingService } from "./service";

function response(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer" } }); }
function failure(error: unknown) {
  if (isAuthError(error)) return response({ error: error.code, message: authMessages[error.code] ?? "Connect your Twitch account." }, ["forbidden", "subscription_scope"].includes(error.code) ? 403 : 401);
  if (isPersistenceError(error)) return response({ error: error.code, message: persistenceMessages[error.code] }, error.code === "forbidden" ? 403 : error.code === "invalid_input" ? 400 : 503);
  const code = housingCode(error); return response({ error: code, message: housingMessages[code] }, code === "busy" ? 409 : 503);
}
export function createHousingHandlers(authService: () => AuthService, housing: () => SubscriberHousingService, chat: () => ChatManager, persistence: () => TownPersistenceService, production: boolean) {
  const names = cookieNames(production);
  async function identify(request: NextRequest, mutation = false) {
    const auth = authService(), id = request.cookies.get(names.session)?.value;
    if (mutation && (request.method !== "POST" || request.nextUrl.origin !== auth.config.origin || request.headers.get("origin") !== auth.config.origin || request.headers.get("sec-fetch-site") === "cross-site")) throw new AuthError("forbidden");
    const grant = await auth.scopedSession(id, mutation);
    if (mutation && (!id || !safeEqual(request.headers.get("x-csrf-token") ?? "", auth.csrfToken(id)))) throw new AuthError("forbidden");
    return { auth, id: id!, grant };
  }
  return {
    async status(request: NextRequest) {
      try {
        const { auth, id, grant } = await identify(request);
        return response({ ...(await housing().status(grant.profile)), ...chat().housingStatus(grant.profile.twitchUserId), authorized: grant.scopes.includes(SUBSCRIPTION_SCOPE), csrfToken: auth.csrfToken(id) });
      } catch (error) { return failure(error); }
    },
    async control(request: NextRequest) {
      try {
        const { auth, id, grant } = await identify(request, true);
        const { action } = parseInput(z.object({ action: z.enum(["authorize", "sync", "connect", "disconnect"]) }).strict(), await readTownInput(request));
        if (!await persistence().mine(grant.profile)) throw new HousingError("not_found");
        if (action === "authorize") {
          const login = auth.beginLogin(request.cookies.get(names.state)?.value, grant.profile.twitchUserId, [SUBSCRIPTION_SCOPE, ...grant.scopes.filter((scope) => scope === CHAT_SCOPE)]);
          const result = response({ location: login.location }); result.cookies.set(names.state, login.binding, cookieOptions(production, STATE_TTL_MS / 1000)); return result;
        }
        if (!grant.scopes.includes(SUBSCRIPTION_SCOPE)) throw new AuthError("subscription_scope");
        if (action === "sync") return response({ sync: await housing().startSync(grant) }, 202);
        if (action === "connect") await chat().start(id, "housing");
        else await chat().stop(id, "housing");
        return response({ ok: true });
      } catch (error) { return failure(error); }
    },
    async house(request: NextRequest) {
      try {
        const { grant } = await identify(request);
        return response({ house: await persistence().ownHouse(grant.profile, request.nextUrl.searchParams.get("townId") ?? "") });
      } catch (error) { return failure(error); }
    },
  };
}

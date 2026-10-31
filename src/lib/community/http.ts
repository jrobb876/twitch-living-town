import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookieNames, cookieOptions } from "../auth/config";
import { safeEqual } from "../auth/crypto";
import { AuthError, isAuthError, COMMUNITY_SCOPES, FOLLOWER_SCOPE, SUBSCRIPTION_SCOPE, STATE_TTL_MS } from "../auth/types";
import { authMessages } from "../auth/messages";
import type { AuthService } from "../auth/service";
import type { ChatManager } from "../chat/manager";
import { readTownInput } from "../persistence/http";
import { parseInput } from "../persistence/validation";
import { isPersistenceError } from "../persistence/types";
import { communityCode, type CommunityImportService } from "./service";
import { communityMessages } from "./types";

function response(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer" } }); }
export function createCommunityHandlers(authService: () => AuthService, community: () => CommunityImportService, chat: () => ChatManager, production: boolean) {
  const names = cookieNames(production);
  async function identify(request: NextRequest, mutation = false) {
    const auth = authService(), id = request.cookies.get(names.session)?.value;
    if (mutation && (request.method !== "POST" || request.nextUrl.origin !== auth.config.origin || request.headers.get("origin") !== auth.config.origin || request.headers.get("sec-fetch-site") === "cross-site")) throw new AuthError("forbidden");
    const grant = await auth.scopedSession(id, mutation);
    if (mutation && (!id || !safeEqual(request.headers.get("x-csrf-token") ?? "", auth.csrfToken(id)))) throw new AuthError("forbidden");
    return { auth, id: id!, grant };
  }
  function failure(error: unknown) {
    if (isAuthError(error)) return response({ error: error.code, message: authMessages[error.code] }, ["forbidden", "follower_scope", "subscription_scope"].includes(error.code) ? 403 : 401);
    const code = isPersistenceError(error) ? error.code : communityCode(error);
    return response({ error: code, message: communityMessages[code] ?? "Community import is unavailable. Your saved town is retained." }, code === "invalid_input" ? 400 : code === "forbidden" ? 403 : ["busy", "conflict"].includes(code) ? 409 : 503);
  }
  return {
    async status(request: NextRequest) {
      try {
        const { auth, id, grant } = await identify(request);
        return response({ ...await community().status(grant.profile), ...chat().followerStatus(grant.profile.twitchUserId),
          followersAuthorized: grant.scopes.includes(FOLLOWER_SCOPE), subscribersAuthorized: grant.scopes.includes(SUBSCRIPTION_SCOPE), csrfToken: auth.csrfToken(id) });
      } catch (error) { return failure(error); }
    },
    async control(request: NextRequest) {
      try {
        const { auth, id, grant } = await identify(request, true);
        const { action } = parseInput(z.object({ action: z.enum(["authorize", "import", "connect", "disconnect"]) }).strict(), await readTownInput(request));
        if (!(await community().status(grant.profile)).hasTown) return response({ error: "not_found", message: "Create your town before importing its community." }, 404);
        if (action === "authorize") {
          const login = auth.beginLogin(request.cookies.get(names.state)?.value, grant.profile.twitchUserId,
            [FOLLOWER_SCOPE, SUBSCRIPTION_SCOPE, ...grant.scopes.filter((scope) => COMMUNITY_SCOPES.includes(scope))]);
          const result = response({ location: login.location }); result.cookies.set(names.state, login.binding, cookieOptions(production, STATE_TTL_MS / 1000)); return result;
        }
        if (!grant.scopes.includes(FOLLOWER_SCOPE)) throw new AuthError("follower_scope");
        if (action === "import") return response({ summary: await community().start(grant) }, 202);
        if (action === "connect") await chat().start(id, "followers"); else await chat().stop(id, "followers");
        return response({ ok: true });
      } catch (error) { return failure(error); }
    },
  };
}

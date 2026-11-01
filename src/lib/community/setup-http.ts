import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookieNames, cookieOptions } from "../auth/config";
import { safeEqual } from "../auth/crypto";
import type { AuthService } from "../auth/service";
import { AuthError, isAuthError, COMMUNITY_SCOPES, STATE_TTL_MS } from "../auth/types";
import { authMessages } from "../auth/messages";
import { readTownInput } from "../persistence/http";
import { parseInput } from "../persistence/validation";
import { features, featureScopes, selectionSchema } from "./setup-model";
import type { CommunitySetup } from "./setup";

const body = z.object({ action: z.enum(["authorize", "connect"]), townId: z.string().min(1).max(100), selected: selectionSchema }).strict();
function response(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer" } }); }
export function createSetupHandlers(authService: () => AuthService, setup: () => CommunitySetup, production: boolean) {
  const names = cookieNames(production);
  function failure(error: unknown) {
    const code = isAuthError(error) ? error.code : (error as { code?: string })?.code;
    const safe = ["forbidden", "unauthorized", "expired", "invalid_token", "invalid_input", "not_found", "capacity"].includes(code ?? "") ? code! : "unavailable";
    return response({ error: safe, message: authMessages[safe] ?? (safe === "not_found" ? "Create your town first." : "Community setup could not be completed. Your saved progress is retained.") },
      safe === "forbidden" ? 403 : ["unauthorized", "expired", "invalid_token"].includes(safe) ? 401 : safe === "invalid_input" ? 400 : safe === "not_found" ? 404 : 503);
  }
  return {
    async status(request: NextRequest) {
      try { const id = request.cookies.get(names.session)?.value; if (!id) throw new AuthError("unauthorized"); return response(await setup().status(id)); }
      catch (error) { return failure(error); }
    },
    async control(request: NextRequest) {
      try {
        const auth = authService(), id = request.cookies.get(names.session)?.value;
        if (request.method !== "POST" || request.nextUrl.origin !== auth.config.origin || request.headers.get("origin") !== auth.config.origin
          || request.headers.get("sec-fetch-site") === "cross-site" || !id || !safeEqual(request.headers.get("x-csrf-token") ?? "", auth.csrfToken(id))) throw new AuthError("forbidden");
        const grant = await auth.scopedSession(id, true);
        const input = parseInput(body, await readTownInput(request));
        const wanted = features.filter((f) => input.selected[f]);
        if (!wanted.length) return response({ error: "invalid_input", message: "Choose at least one optional feature." }, 400);
        const status = await setup().status(id);
        if (status.townId !== input.townId) throw new AuthError("forbidden");
        if (input.action === "authorize") {
          const scopes = [...wanted.map((f) => featureScopes[f]), ...grant.scopes.filter((scope) => COMMUNITY_SCOPES.includes(scope))];
          const login = auth.beginLogin(request.cookies.get(names.state)?.value, grant.profile.twitchUserId, scopes, true);
          const result = response({ location: login.location }); result.cookies.set(names.state, login.binding, cookieOptions(production, STATE_TTL_MS / 1000)); return result;
        }
        return response(await setup().connect(id, input.townId, input.selected));
      } catch (error) { return failure(error); }
    },
  };
}

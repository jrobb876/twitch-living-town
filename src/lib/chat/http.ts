import { NextRequest, NextResponse } from "next/server";
import { cookieNames, cookieOptions } from "../auth/config";
import { safeEqual } from "../auth/crypto";
import type { AuthService } from "../auth/service";
import { AuthError, isAuthError, STATE_TTL_MS } from "../auth/types";
import { authDiagnostic } from "../auth/diagnostics";
import type { ChatManager } from "./manager";
import { CHAT_SCOPE, COMMUNITY_SCOPES } from "../auth/types";

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
function failure(error: unknown) {
  const code = isAuthError(error) ? error.code : "unavailable";
  return privateResponse(NextResponse.json({ error: code }, { status: code === "unauthorized" || code === "invalid_token" ? 401
    : code === "forbidden" || code === "chat_scope" ? 403 : 503 }));
}
/** No broadcaster/town IDs accepted from the browser. Identity always comes from its session. */
export function createChatHandlers(authService: () => AuthService, chatManager: () => ChatManager, production: boolean) {
  const names = cookieNames(production);
  async function control(request: NextRequest) {
    const auth = authService(), id = request.cookies.get(names.session)?.value;
    if (request.method !== "POST" || request.nextUrl.origin !== auth.config.origin || request.headers.get("origin") !== auth.config.origin
      || request.headers.get("sec-fetch-site") === "cross-site") throw new AuthError("forbidden");
    const grant = await auth.chatSession(id);
    const csrf = request.headers.get("x-csrf-token");
    if (!id || !csrf || !safeEqual(csrf, auth.csrfToken(id))) throw new AuthError("forbidden");
    return { auth, id, grant };
  }
  return {
    async status(request: NextRequest) {
      try { return privateResponse(NextResponse.json(await chatManager().snapshot(request.cookies.get(names.session)?.value))); }
      catch (error) { return failure(error); }
    },
    async authorize(request: NextRequest) {
      authDiagnostic("chat_authorize", "start");
      try {
        const { auth, grant } = await control(request);
        const login = auth.beginLogin(request.cookies.get(names.state)?.value, grant.profile.twitchUserId,
          [CHAT_SCOPE, ...grant.scopes.filter((scope) => COMMUNITY_SCOPES.includes(scope))]);
        // JS navigates to this public OAuth URL; it contains no user tokens or client secret.
        const response = privateResponse(NextResponse.json({ location: login.location }));
        response.cookies.set(names.state, login.binding, cookieOptions(production, STATE_TTL_MS / 1000));
        authDiagnostic("chat_authorize", "success");
        return response;
      } catch (error) { authDiagnostic("chat_authorize", "failure", error); return failure(error); }
    },
    async start(request: NextRequest) {
      try { const { id } = await control(request); await chatManager().start(id); return privateResponse(NextResponse.json({ ok: true })); }
      catch (error) { return failure(error); }
    },
    async stop(request: NextRequest) {
      try { const { id } = await control(request); await chatManager().stop(id); return privateResponse(NextResponse.json({ ok: true })); }
      catch (error) { return failure(error); }
    },
  };
}

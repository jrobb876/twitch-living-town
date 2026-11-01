import { NextRequest, NextResponse } from "next/server";
import { cookieNames, cookieOptions } from "./config";
import { AuthError, isAuthError, SESSION_TTL_MS, STATE_TTL_MS } from "./types";
import { authDiagnostic, type AuthOperation } from "./diagnostics";
import type { AuthService } from "./service";

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Cookie");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
function redirect(location: string) { return privateResponse(new NextResponse(null, { status: 303, headers: { Location: location } })); }
function errorCode(error: unknown) { return isAuthError(error) ? error.code : "unavailable"; }

/** Shared handlers with dependency injection for credential-free HTTP tests. */
export function createAuthHandlers(service: () => AuthService, production: boolean) {
  const names = cookieNames(production);
  function clear(response: NextResponse, name: string) { response.cookies.set(name, "", cookieOptions(production, 0)); }
  return {
    login(request: NextRequest) {
      let operation: AuthOperation = "login_configuration";
      authDiagnostic(operation, "start");
      try {
        const auth = service();
        if (request.nextUrl.origin !== auth.config.origin) throw new AuthError("forbidden");
        // No caller-directed return path is supported. Scope upgrades use fixed destinations.
        if (["returnTo", "returnUrl", "next"].some((key) => request.nextUrl.searchParams.has(key))) throw new AuthError("forbidden");
        operation = "login_state";
        const login = auth.beginLogin(request.cookies.get(names.state)?.value);
        operation = "login_redirect";
        const response = redirect(login.location);
        response.cookies.set(names.state, login.binding, cookieOptions(production, STATE_TTL_MS / 1000));
        authDiagnostic(operation, "success");
        return response;
      } catch (error) { authDiagnostic(operation, "failure", error); return redirect(`/account?auth=${errorCode(error)}`); }
    },
    async callback(request: NextRequest) {
      let response: NextResponse;
      let auth: AuthService | undefined;
      let operation: AuthOperation = "callback_configuration";
      authDiagnostic(operation, "start");
      try {
        auth = service();
        operation = "callback_parameters";
        const params = request.nextUrl.searchParams;
        if (request.nextUrl.origin !== auth.config.origin) throw new AuthError("state");
        for (const key of ["state", "code", "error"]) if (params.getAll(key).length > 1) throw new AuthError("state");
        operation = "callback_session";
        const login = await auth.finishLogin({ state: params.get("state") ?? undefined, code: params.get("code") ?? undefined,
          error: params.get("error") ?? undefined }, request.cookies.get(names.state)?.value, request.cookies.get(names.session)?.value);
        response = redirect(login.communitySetup ? "/dashboard/town?setup=authorized#community" : login.communityRequested ? "/dashboard/town?community=authorized#community" : login.housingRequested ? "/town-overview?housing=authorized" : login.chatRequested ? "/town-overview?chat=authorized" : "/dashboard");
        response.cookies.set(names.session, login.id, cookieOptions(production, SESSION_TTL_MS / 1000));
        authDiagnostic(operation, "success");
      } catch (error) { authDiagnostic(operation, "failure", error); response = redirect(isAuthError(error) && error.communitySetup
        ? `/dashboard/town?setup=${errorCode(error)}#community` : `/account?auth=${errorCode(error)}`); }
      auth?.cancelLogin(request.cookies.get(names.state)?.value);
      clear(response, names.state); // Never retain the OAuth binding after any callback.
      return response;
    },
    async session(request: NextRequest) {
      try {
        const auth = service(), id = request.cookies.get(names.session)?.value;
        const user = await auth.getProfile(id);
        const response = privateResponse(NextResponse.json({ user, csrfToken: user && id ? auth.csrfToken(id) : null, configured: true }));
        if (!user && id) clear(response, names.session);
        return response;
      } catch (error) {
        const code = errorCode(error);
        const response = privateResponse(NextResponse.json({ user: null, csrfToken: null, configured: code !== "configuration", error: code },
          { status: code === "configuration" || code === "unavailable" ? 503 : 401 }));
        if (code !== "unavailable") clear(response, names.session);
        return response;
      }
    },
    async logout(request: NextRequest) {
      try {
        const auth = service();
        if (request.headers.get("origin") !== auth.config.origin || request.nextUrl.origin !== auth.config.origin
          || request.headers.get("sec-fetch-site") === "cross-site") throw new AuthError("forbidden");
        if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new AuthError("forbidden");
        if (Number(request.headers.get("content-length")) > 1024) throw new AuthError("forbidden");
        const body = await request.text();
        if (body.length > 1024) throw new AuthError("forbidden");
        await auth.signOut(request.cookies.get(names.session)?.value, new URLSearchParams(body).get("csrfToken") ?? undefined);
        auth.cancelLogin(request.cookies.get(names.state)?.value);
        const response = request.headers.get("accept") === "application/json"
          ? privateResponse(NextResponse.json({ signedOut: true })) : redirect("/");
        clear(response, names.session); clear(response, names.state);
        return response;
      } catch (error) { return privateResponse(NextResponse.json({ error: errorCode(error) }, { status: 403 })); }
    },
  };
}

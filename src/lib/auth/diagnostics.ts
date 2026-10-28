import { isAuthError } from "./types";

export type AuthOperation = "login_configuration" | "login_state" | "login_redirect" | "callback_configuration" | "callback_parameters"
  | "callback_state" | "callback_code" | "token_exchange" | "token_validation" | "identity_validation" | "profile"
  | "chat_permission" | "token_scope_validation" | "session_creation" | "callback_session" | "token_refresh" | "token_revocation" | "token_cleanup" | "chat_authorize";
const endpoints: Partial<Record<AuthOperation, string>> = {
  token_exchange: "id.twitch.tv/oauth2/token", token_refresh: "id.twitch.tv/oauth2/token",
  token_validation: "id.twitch.tv/oauth2/validate", profile: "api.twitch.tv/helix/users", token_revocation: "id.twitch.tv/oauth2/revoke",
  token_scope_validation: "id.twitch.tv/oauth2/validate",
};

/** Classify only allowlisted properties. Never serialize the error, cause, message, stack or URL. */
export function authErrorCategory(error: unknown): string {
  if (isAuthError(error)) return error.code;
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const item = current as { code?: unknown; name?: unknown; cause?: unknown };
    const code = typeof item.code === "string" ? item.code : "";
    if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "dns";
    if (["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(code) || item.name === "TimeoutError") return "timeout";
    if (["CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"].includes(code)) return "tls";
    if (["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_SOCKET"].includes(code)) return "connection";
    if (item.name === "AbortError") return "aborted";
    if (item.name === "SyntaxError") return "invalid_json";
    current = item.cause;
  }
  if (error && typeof error === "object" && "name" in error && error.name === "TypeError") return "type_error";
  return "unexpected_error";
}

export type AuthDiagnostic = { event: "twitch_auth"; operation: AuthOperation; outcome: "start" | "success" | "failure";
  endpoint?: string; category?: string; httpStatus?: number };
export function createAuthDiagnosticLogger(write: (entry: AuthDiagnostic) => void) {
  return (operation: AuthOperation, outcome: AuthDiagnostic["outcome"], error?: unknown, httpStatus?: number) => {
    const entry: AuthDiagnostic = { event: "twitch_auth", operation, outcome };
    if (endpoints[operation]) entry.endpoint = endpoints[operation];
    if (outcome === "failure") entry.category = httpStatus ? "http_error" : authErrorCategory(error);
    if (Number.isInteger(httpStatus) && httpStatus! >= 100 && httpStatus! <= 599) entry.httpStatus = httpStatus;
    try { write(entry); } catch { /* Diagnostics must never interrupt authentication. */ }
  };
}
export const authDiagnostic = createAuthDiagnosticLogger((entry) => console.info(JSON.stringify(entry)));

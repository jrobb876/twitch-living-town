import { AuthError, isAuthError, type AccountProfile, type AuthConfig, type OAuthTokens, type TokenValidation, type TwitchGateway } from "./types";
import { authDiagnostic, type AuthOperation } from "./diagnostics";

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AuthError("invalid_token");
  return value as JsonObject;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 4096) throw new AuthError("invalid_token");
  return value;
}

export class TwitchClient implements TwitchGateway {
  constructor(private config: AuthConfig, private request: typeof fetch = fetch) {}
  private async call(operation: AuthOperation, url: string, options: RequestInit, invalidCode: "invalid_token" | "code" = "invalid_token") {
    let response: Response;
    authDiagnostic(operation, "start");
    try {
      response = await this.request(url, { ...options, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    } catch (error) { authDiagnostic(operation, "failure", error); throw new AuthError("unavailable"); }
    if (!response.ok) {
      authDiagnostic(operation, "failure", undefined, response.status);
      if (response.status === 400 || response.status === 401 || response.status === 403) throw new AuthError(invalidCode);
      throw new AuthError("unavailable");
    }
    authDiagnostic(operation, "success", undefined, response.status);
    return response;
  }
  private async json(response: Response, operation: AuthOperation): Promise<JsonObject> {
    try { return object(await response.json()); }
    catch (error) {
      authDiagnostic(operation, "failure", error);
      if (isAuthError(error)) throw error;
      // Body-read transport failures are not evidence of an invalid OAuth token.
      throw new AuthError(error && typeof error === "object" && "name" in error && error.name === "SyntaxError" ? "invalid_token" : "unavailable");
    }
  }
  private async token(parameters: Record<string, string>, invalidCode: "invalid_token" | "code"): Promise<OAuthTokens> {
    const response = await this.call(invalidCode === "code" ? "token_exchange" : "token_refresh", "https://id.twitch.tv/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, ...parameters }),
    }, invalidCode);
    const body = await this.json(response, invalidCode === "code" ? "token_exchange" : "token_refresh");
    if (typeof body.token_type !== "string" || body.token_type.toLowerCase() !== "bearer") throw new AuthError("invalid_token");
    return { accessToken: text(body.access_token), refreshToken: text(body.refresh_token) };
  }
  exchange(code: string) {
    return this.token({ code, grant_type: "authorization_code", redirect_uri: this.config.redirectUri }, "code");
  }
  refresh(refreshToken: string) { return this.token({ refresh_token: refreshToken, grant_type: "refresh_token" }, "invalid_token"); }
  async validate(accessToken: string): Promise<TokenValidation> {
    const body = await this.json(await this.call("token_validation", "https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${accessToken}` } }), "token_validation");
    if (typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0) throw new AuthError("invalid_token");
    // No requested permissions may be represented as null/omitted, not only [].
    // Normalize to zero grants; chat still requires an explicit granted scope.
    const scopes = body.scopes ?? [];
    if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== "string")) {
      const error = new AuthError("invalid_token");
      authDiagnostic("token_scope_validation", "failure", error);
      throw error;
    }
    return { clientId: text(body.client_id), userId: text(body.user_id), expiresIn: body.expires_in, scopes };
  }
  async profile(accessToken: string): Promise<AccountProfile> {
    const body = await this.json(await this.call("profile", "https://api.twitch.tv/helix/users", { headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": this.config.clientId } }), "profile");
    if (!Array.isArray(body.data) || body.data.length !== 1) throw new AuthError("invalid_token");
    const user = object(body.data[0]);
    let profileImageUrl: string | null = null;
    try {
      const url = new URL(String(user.profile_image_url));
      if (url.protocol === "https:" && url.hostname === "static-cdn.jtvnw.net" && !url.username && !url.password) profileImageUrl = url.href;
    } catch { /* A missing image is not an authentication failure. */ }
    return { twitchUserId: text(user.id), login: text(user.login), displayName: text(user.display_name), profileImageUrl };
  }
  async revoke(accessToken: string) {
    await this.call("token_revocation", "https://id.twitch.tv/oauth2/revoke", { method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId, token: accessToken }),
    });
  }
}

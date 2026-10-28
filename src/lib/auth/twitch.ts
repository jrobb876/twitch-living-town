import { AuthError, type AccountProfile, type AuthConfig, type OAuthTokens, type TokenValidation, type TwitchGateway } from "./types";

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
  private async call(url: string, options: RequestInit, invalidCode: "invalid_token" | "code" = "invalid_token") {
    let response: Response;
    try {
      response = await this.request(url, { ...options, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    } catch { throw new AuthError("unavailable"); }
    if (!response.ok) {
      if (response.status === 400 || response.status === 401 || response.status === 403) throw new AuthError(invalidCode);
      throw new AuthError("unavailable");
    }
    return response;
  }
  private async json(response: Response): Promise<JsonObject> {
    try { return object(await response.json()); } catch { throw new AuthError("invalid_token"); }
  }
  private async token(parameters: Record<string, string>, invalidCode: "invalid_token" | "code"): Promise<OAuthTokens> {
    const response = await this.call("https://id.twitch.tv/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, ...parameters }),
    }, invalidCode);
    const body = await this.json(response);
    if (typeof body.token_type !== "string" || body.token_type.toLowerCase() !== "bearer") throw new AuthError("invalid_token");
    return { accessToken: text(body.access_token), refreshToken: text(body.refresh_token) };
  }
  exchange(code: string) {
    return this.token({ code, grant_type: "authorization_code", redirect_uri: this.config.redirectUri }, "code");
  }
  refresh(refreshToken: string) { return this.token({ refresh_token: refreshToken, grant_type: "refresh_token" }, "invalid_token"); }
  async validate(accessToken: string): Promise<TokenValidation> {
    const body = await this.json(await this.call("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${accessToken}` } }));
    if (typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0) throw new AuthError("invalid_token");
    return { clientId: text(body.client_id), userId: text(body.user_id), expiresIn: body.expires_in };
  }
  async profile(accessToken: string): Promise<AccountProfile> {
    const body = await this.json(await this.call("https://api.twitch.tv/helix/users", { headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": this.config.clientId } }));
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
    await this.call("https://id.twitch.tv/oauth2/revoke", { method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId, token: accessToken }),
    });
  }
}

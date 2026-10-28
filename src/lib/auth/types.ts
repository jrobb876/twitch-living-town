/** The only identity shape allowed to cross the server/browser boundary. */
export type AccountProfile = {
  twitchUserId: string;
  login: string;
  displayName: string;
  profileImageUrl: string | null;
};

export type AuthErrorCode = "configuration" | "state" | "denied" | "code" | "unavailable" | "invalid_token" | "expired" | "unauthorized" | "forbidden" | "capacity";
export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) { super(code); this.name = "AuthError"; }
}

export type AuthConfig = {
  clientId: string; clientSecret: string; redirectUri: string; origin: string;
  sessionSecret: string; production: boolean;
};

export type OAuthTokens = { accessToken: string; refreshToken: string };
export type TokenValidation = { clientId: string; userId: string; expiresIn: number };
export interface TwitchGateway {
  exchange(code: string): Promise<OAuthTokens>;
  validate(accessToken: string): Promise<TokenValidation>;
  profile(accessToken: string): Promise<AccountProfile>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  revoke(accessToken: string): Promise<void>;
}

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const STATE_TTL_MS = 10 * 60 * 1000;
export const VALIDATION_INTERVAL_MS = 30 * 60 * 1000;

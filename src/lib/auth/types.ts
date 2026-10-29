/** The only identity shape allowed to cross the server/browser boundary. */
export type AccountProfile = {
  twitchUserId: string;
  login: string;
  displayName: string;
  profileImageUrl: string | null;
};

export type AuthErrorCode = "configuration" | "state" | "denied" | "code" | "unavailable" | "invalid_token" | "expired" | "unauthorized" | "forbidden" | "capacity" | "chat_scope" | "subscription_scope";
export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) { super(code); this.name = "AuthError"; }
}

const authErrorCodes = new Set<string>(["configuration", "state", "denied", "code", "unavailable", "invalid_token", "expired", "unauthorized", "forbidden", "capacity", "chat_scope", "subscription_scope"] satisfies AuthErrorCode[]);
/** Cached services can outlive their module instance. Class identity is not stable across route bundles/HMR. */
export function isAuthError(error: unknown): error is AuthError {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === "AuthError" && typeof candidate.code === "string" && authErrorCodes.has(candidate.code);
}

export type AuthConfig = {
  clientId: string; clientSecret: string; redirectUri: string; origin: string;
  sessionSecret: string; production: boolean;
};

export type OAuthTokens = { accessToken: string; refreshToken: string };
export type TokenValidation = { clientId: string; userId: string; expiresIn: number; scopes: string[] };
export const CHAT_SCOPE = "user:read:chat";
export const SUBSCRIPTION_SCOPE = "channel:read:subscriptions";
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

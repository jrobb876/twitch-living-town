import { AuthError, type AuthConfig } from "./types";

/** Accept explicit input so tests never read the developer's credentials. */
export function parseAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const clientId = env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = env.TWITCH_CLIENT_SECRET?.trim();
  const redirectUri = env.TWITCH_REDIRECT_URI?.trim();
  const configuredSecret = env.SESSION_SECRET?.trim();
  // Accept either common encoding of a 32-byte key. TokenVault consumes base64.
  const sessionSecret = configuredSecret && /^[a-fA-F0-9]{64}$/.test(configuredSecret)
    ? Buffer.from(configuredSecret, "hex").toString("base64")
    : configuredSecret;
  if (!clientId || !clientSecret || !redirectUri || !sessionSecret
    || !/^[A-Za-z0-9+/]{43}=$/.test(sessionSecret) || Buffer.from(sessionSecret, "base64").length !== 32) {
    throw new AuthError("configuration");
  }
  let url: URL;
  try { url = new URL(redirectUri); } catch { throw new AuthError("configuration"); }
  const production = env.NODE_ENV === "production";
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/api/auth/twitch/callback"
    || (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost" && !production))) {
    throw new AuthError("configuration");
  }
  return { clientId, clientSecret, redirectUri, origin: url.origin, sessionSecret, production };
}

export function cookieNames(production: boolean) {
  const prefix = production ? "__Host-" : "";
  return { session: `${prefix}living-town-session`, state: `${prefix}living-town-oauth` };
}

export function cookieOptions(production: boolean, maxAge: number) {
  return { httpOnly: true, secure: production, sameSite: "lax" as const, path: "/", maxAge };
}

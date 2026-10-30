import { parseAuthConfig } from "./config";
import { AuthService } from "./service";
import { MemoryAuthStore } from "./store";
import type { AccountProfile, OAuthTokens, TokenValidation, TwitchGateway } from "./types";

// Deliberately synthetic values. These tests never read process.env or call Twitch.
export const testEnv = {
  TWITCH_CLIENT_ID: "test-client", TWITCH_CLIENT_SECRET: "test-client-secret",
  TWITCH_REDIRECT_URI: "http://localhost:3000/api/auth/twitch/callback",
  SESSION_SECRET: Buffer.alloc(32, 7).toString("base64"), NODE_ENV: "test",
};
export class FakeTwitch implements TwitchGateway {
  tokens: OAuthTokens = { accessToken: "test-access", refreshToken: "test-refresh" };
  identity: AccountProfile = { twitchUserId: "12345", login: "neighbor", displayName: "Neighbor", profileImageUrl: null };
  validation: TokenValidation = { clientId: "test-client", userId: "12345", expiresIn: 7200, scopes: [] };
  exchanges: string[] = [];
  validations: string[] = [];
  refreshes: string[] = [];
  revocations: string[] = [];
  async exchange(code: string) { this.exchanges.push(code); return { ...this.tokens }; }
  async validate(token: string) { this.validations.push(token); return { ...this.validation }; }
  async profile() { return { ...this.identity }; }
  async refresh(token: string) {
    this.refreshes.push(token);
    return { accessToken: "rotated-access", refreshToken: "rotated-refresh" };
  }
  async revoke(token: string) { this.revocations.push(token); }
}
export function fixture(production = false, redirectUri?: string) {
  const config = parseAuthConfig({ ...testEnv, ...(production ? { NODE_ENV: "production", TWITCH_REDIRECT_URI: "https://town.example/api/auth/twitch/callback" } : {}),
    ...(redirectUri ? { TWITCH_REDIRECT_URI: redirectUri } : {}) });
  const twitch = new FakeTwitch(), store = new MemoryAuthStore();
  let clock = 1_000_000;
  const service = new AuthService(config, twitch, store, () => clock);
  const begin = () => {
    const attempt = service.beginLogin();
    return { ...attempt, state: new URL(attempt.location).searchParams.get("state")! };
  };
  const login = (previous?: string) => {
    const attempt = begin();
    return service.finishLogin({ state: attempt.state, code: "test-code" }, attempt.binding, previous);
  };
  return { config, twitch, store, service, begin, login, advance: (ms: number) => { clock += ms; } };
}

import { isOpaqueToken, randomToken, safeEqual, TokenVault } from "./crypto";
import { MemoryAuthStore, type StoredSession } from "./store";
import { AuthError, isAuthError, CHAT_SCOPE, SUBSCRIPTION_SCOPE, SESSION_TTL_MS, STATE_TTL_MS, VALIDATION_INTERVAL_MS, type AccountProfile, type AuthConfig, type OAuthTokens, type TwitchGateway, type TokenValidation } from "./types";
import { authDiagnostic, type AuthOperation } from "./diagnostics";

export class AuthService {
  private vault: TokenVault;
  private checks = new Map<string, Promise<AccountProfile | null>>();
  private maintenanceRunning = false;
  constructor(readonly config: AuthConfig, private twitch: TwitchGateway,
    private store = new MemoryAuthStore(), private now: () => number = Date.now) {
    this.vault = new TokenVault(config.sessionSecret);
  }
  private sessionKey(id: string) { return this.vault.digest("session", id); }
  csrfToken(id: string) { return this.vault.digest("logout-csrf", id); }

  beginLogin(previousBinding?: string, chatUserId?: string, scopes = chatUserId ? [CHAT_SCOPE] : []) {
    const requiredScopes = [...new Set(scopes)];
    if (requiredScopes.some((scope) => ![CHAT_SCOPE, SUBSCRIPTION_SCOPE].includes(scope)) || (requiredScopes.length && !chatUserId)) throw new AuthError("forbidden");
    this.cancelLogin(previousBinding);
    for (const [key, entry] of this.store.states) if (entry.expiresAt <= this.now()) this.store.states.delete(key);
    if (this.store.states.size >= 1000) throw new AuthError("capacity");
    const state = randomToken(), binding = randomToken();
    this.store.states.set(this.vault.digest("state", state), {
      bindingHash: this.vault.digest("binding", binding), expiresAt: this.now() + STATE_TTL_MS, chatUserId, requiredScopes,
    });
    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri,
      response_type: "code", scope: requiredScopes.join(" "), state, force_verify: "true" }).toString();
    return { location: url.href, binding };
  }
  cancelLogin(binding?: string) {
    if (!isOpaqueToken(binding)) return;
    const hash = this.vault.digest("binding", binding);
    for (const [key, entry] of this.store.states) if (safeEqual(entry.bindingHash, hash)) this.store.states.delete(key);
  }
  private consumeState(state?: string, binding?: string) {
    if (!isOpaqueToken(state)) throw new AuthError("state");
    const entry = this.store.consumeState(this.vault.digest("state", state));
    if (!entry || entry.expiresAt <= this.now() || !isOpaqueToken(binding)
      || !safeEqual(entry.bindingHash, this.vault.digest("binding", binding))) throw new AuthError("state");
    return entry;
  }
  private checkIdentity(validation: TokenValidation, userId?: string) {
    if (validation.clientId !== this.config.clientId || !/^\d+$/.test(validation.userId)
      || (userId && validation.userId !== userId)) throw new AuthError("invalid_token");
  }
  async finishLogin(input: { state?: string; code?: string; error?: string }, binding?: string, oldSessionId?: string) {
    let tokens: OAuthTokens | undefined;
    let operation: AuthOperation = "callback_state";
    try {
      const attempt = this.consumeState(input.state, binding);
      operation = "callback_code";
      if (input.error) throw new AuthError("denied");
      if (!input.code || input.code.length > 2048) throw new AuthError("code");
      operation = "token_exchange";
      tokens = await this.twitch.exchange(input.code);
      operation = "token_validation";
      const validation = await this.twitch.validate(tokens.accessToken);
      operation = "identity_validation";
      this.checkIdentity(validation);
      operation = "profile";
      const profile = await this.twitch.profile(tokens.accessToken);
      operation = "identity_validation";
      this.checkIdentity(validation, profile.twitchUserId);
      operation = "chat_permission";
      const required = attempt.requiredScopes ?? (attempt.chatUserId ? [CHAT_SCOPE] : []);
      if (attempt.chatUserId && (attempt.chatUserId !== profile.twitchUserId || required.some((scope) => !validation.scopes.includes(scope))))
        throw new AuthError(required.includes(SUBSCRIPTION_SCOPE) ? "subscription_scope" : "chat_scope");
      // Keep validation work bounded for this single-process prototype.
      if (this.store.sessions.size >= 200) throw new AuthError("capacity");
      operation = "session_creation";
      const id = randomToken(), key = this.sessionKey(id), now = this.now();
      this.store.sessions.set(key, { profile, scopes: [...validation.scopes], encryptedTokens: this.vault.seal(tokens, key),
        tokenFingerprint: this.vault.digest("access-token", tokens.accessToken),
        expiresAt: now + SESSION_TTL_MS, tokenExpiresAt: now + validation.expiresIn * 1000, validatedAt: now });
      // Rotate the current browser's session without retaining a fixation target.
      // Do not revoke a token reused by Twitch for the new session.
      if (isOpaqueToken(oldSessionId)) {
        const oldKey = this.sessionKey(oldSessionId), old = this.store.sessions.get(oldKey);
        this.store.sessions.delete(oldKey);
        if (old && old.tokenFingerprint !== this.vault.digest("access-token", tokens.accessToken)) this.queueRevocation(oldKey, old);
      }
      return { id, profile: { ...profile }, expiresAt: now + SESSION_TTL_MS,
        chatRequested: required.includes(CHAT_SCOPE), housingRequested: required.includes(SUBSCRIPTION_SCOPE) };
    } catch (error) {
      authDiagnostic(operation, "failure", error);
      if (tokens) {
        try {
          const key = randomToken();
          this.store.revocations.set(key, { key, encryptedTokens: this.vault.seal(tokens, key), expiresAt: this.now() + 60 * 60 * 1000 });
        } catch (cleanupError) { authDiagnostic("token_cleanup", "failure", cleanupError); }
      }
      throw isAuthError(error) ? error : new AuthError("unavailable");
    }
  }
  private queueRevocation(key: string, session: StoredSession) {
    this.store.revocations.set(key, { key, encryptedTokens: session.encryptedTokens, expiresAt: this.now() + 60 * 60 * 1000 });
  }
  private invalidateToken(fingerprint: string) {
    for (const [key, session] of this.store.sessions) if (session.tokenFingerprint === fingerprint) {
      this.store.sessions.delete(key); this.queueRevocation(key, session);
    }
  }
  async getProfile(id?: string, forceValidation = false): Promise<AccountProfile | null> {
    if (!isOpaqueToken(id)) return null;
    return this.profileByKey(this.sessionKey(id), forceValidation);
  }
  private async profileByKey(key: string, forceValidation: boolean): Promise<AccountProfile | null> {
    const session = this.store.sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.store.sessions.delete(key); this.queueRevocation(key, session); return null;
    }
    if (!forceValidation && this.now() - session.validatedAt < VALIDATION_INTERVAL_MS && session.tokenExpiresAt > this.now()) return { ...session.profile };
    const existing = this.checks.get(key);
    if (existing) return existing;
    const check = this.validateSession(key, session);
    this.checks.set(key, check);
    try { return await check; } finally { this.checks.delete(key); }
  }
  private async validateSession(key: string, session: StoredSession): Promise<AccountProfile | null> {
    let refreshed: OAuthTokens | undefined;
    try {
      let tokens = this.vault.open(session.encryptedTokens, key);
      let validation: TokenValidation;
      try { validation = await this.twitch.validate(tokens.accessToken); }
      catch (error) {
        // An unexpected revocation must end the session, not silently reconnect it.
        // Refresh only an expired token, reactively after Twitch returns invalid.
        if (!isAuthError(error) || error.code !== "invalid_token" || session.tokenExpiresAt > this.now()) throw error;
        refreshed = await this.twitch.refresh(tokens.refreshToken);
        tokens = refreshed;
        validation = await this.twitch.validate(tokens.accessToken);
      }
      this.checkIdentity(validation, session.profile.twitchUserId);
      if (this.store.sessions.get(key) !== session || session.expiresAt <= this.now()) {
        if (refreshed) this.queueRevocation(key, { ...session, encryptedTokens: this.vault.seal(refreshed, key) });
        return null; // Sign-out or expiry during a network request cannot resurrect a session.
      }
      session.encryptedTokens = this.vault.seal(tokens, key);
      session.tokenFingerprint = this.vault.digest("access-token", tokens.accessToken);
      session.tokenExpiresAt = this.now() + validation.expiresIn * 1000;
      session.validatedAt = this.now();
      session.scopes = [...validation.scopes];
      return { ...session.profile };
    } catch (error) {
      this.invalidateToken(session.tokenFingerprint);
      if (refreshed) this.queueRevocation(key, { ...session, encryptedTokens: this.vault.seal(refreshed, key) });
      throw isAuthError(error) ? error : new AuthError("invalid_token");
    }
  }
  async signOut(id?: string, csrf?: string) {
    if (!isOpaqueToken(id)) return;
    const key = this.sessionKey(id), session = this.store.sessions.get(key);
    if (!session) return;
    if (!csrf || !safeEqual(csrf, this.csrfToken(id))) throw new AuthError("forbidden");
    this.invalidateToken(session.tokenFingerprint); // Includes any sessions sharing this token.
    await this.flushRevocations();
  }
  /** Server-only capability: never serialize its key or decrypted credentials. */
  async chatSession(id: string | undefined, forceValidation = false) {
    const session = await this.scopedSession(id, forceValidation);
    return { ...session, authorized: session.scopes.includes(CHAT_SCOPE) };
  }
  async scopedSession(id: string | undefined, forceValidation = false) {
    const profile = await this.getProfile(id, forceValidation);
    if (!profile || !id) throw new AuthError("unauthorized");
    const key = this.sessionKey(id), session = this.store.sessions.get(key);
    if (!session) throw new AuthError("unauthorized");
    return { key, profile, scopes: [...(session.scopes ?? [])] };
  }
  chatSessionActive(key: string) {
    return this.scopedSessionActive(key, [CHAT_SCOPE]);
  }
  scopedSessionActive(key: string, scopes: string[]) {
    const session = this.store.sessions.get(key);
    return !!session && session.expiresAt > this.now() && scopes.every((scope) => session.scopes?.includes(scope));
  }
  async chatCredentials(key: string, forceValidation = false) {
    return this.scopedCredentials(key, [CHAT_SCOPE], forceValidation);
  }
  async scopedCredentials(key: string, scopes: string[], forceValidation = false) {
    const profile = await this.profileByKey(key, forceValidation);
    if (!profile) throw new AuthError("unauthorized");
    const session = this.store.sessions.get(key);
    if (!session) throw new AuthError("unauthorized");
    if (scopes.some((scope) => !session.scopes?.includes(scope))) throw new AuthError(scopes.includes(SUBSCRIPTION_SCOPE) ? "subscription_scope" : "chat_scope");
    return { profile, accessToken: this.vault.open(session.encryptedTokens, key).accessToken };
  }
  revokeChat(key: string) {
    const session = this.store.sessions.get(key);
    if (session) this.invalidateToken(session.tokenFingerprint);
  }
  private async flushRevocations() {
    const pending = [...this.store.revocations].slice(0, 50);
    for (let offset = 0; offset < pending.length; offset += 10) {
      await Promise.all(pending.slice(offset, offset + 10).map(async ([id, entry]) => {
      try {
        await this.twitch.revoke(this.vault.open(entry.encryptedTokens, entry.key).accessToken);
        if (this.store.revocations.get(id) === entry) this.store.revocations.delete(id);
      } catch (error) {
        if ((isAuthError(error) && error.code === "invalid_token") || entry.expiresAt <= this.now()) this.store.revocations.delete(id);
        // Fail-closed locally; encrypted best-effort revocations retry on maintenance.
      }
      }));
    }
  }
  /** Called at startup and every minute, even without browser requests. */
  async maintain(forceValidation = false) {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      for (const [key, entry] of this.store.states) if (entry.expiresAt <= this.now()) this.store.states.delete(key);
      const keys = [...this.store.sessions.keys()];
      for (let offset = 0; offset < keys.length; offset += 10) {
        await Promise.all(keys.slice(offset, offset + 10).map(async (key) => {
          try { await this.profileByKey(key, forceValidation); } catch { /* Invalid/unverifiable sessions were removed. */ }
        }));
      }
      await this.flushRevocations();
    } finally { this.maintenanceRunning = false; }
  }
}

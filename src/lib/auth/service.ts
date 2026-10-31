import { isOpaqueToken, randomToken, safeEqual, TokenVault } from "./crypto";
import { MemoryAuthStore, type StoredSession } from "./store";
import { AuthError, isAuthError, CHAT_SCOPE, SUBSCRIPTION_SCOPE, FOLLOWER_SCOPE, COMMUNITY_SCOPES, SESSION_TTL_MS, STATE_TTL_MS, VALIDATION_INTERVAL_MS, type AccountProfile, type AuthConfig, type OAuthTokens, type TwitchGateway, type TokenValidation } from "./types";
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
  async ready() { await this.store.ready(); }

  /** Optional public display metadata for server-selected IDs. Never returns sessions or credentials. */
  async knownDisplayNames(userIds: readonly string[]): Promise<Record<string, string>> {
    await this.store.ready();
    const wanted = new Set(userIds), names: Record<string, string> = {};
    for (const entry of this.store.sessions.values()) {
      if (entry.expiresAt > this.now() && entry.validatedAt > 0 && wanted.has(entry.profile.twitchUserId))
        names[entry.profile.twitchUserId] = entry.profile.displayName;
    }
    return names;
  }

  beginLogin(previousBinding?: string, chatUserId?: string, scopes = chatUserId ? [CHAT_SCOPE] : []) {
    const requiredScopes = [...new Set(scopes)];
    if (requiredScopes.some((scope) => !COMMUNITY_SCOPES.includes(scope)) || (requiredScopes.length && !chatUserId)) throw new AuthError("forbidden");
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
    let createdKey: string | undefined;
    let operation: AuthOperation = "callback_state";
    try {
      await this.store.ready();
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
        throw new AuthError(required.includes(FOLLOWER_SCOPE) ? "follower_scope" : required.includes(SUBSCRIPTION_SCOPE) ? "subscription_scope" : "chat_scope");
      // Keep validation work bounded for this single-process prototype.
      if (this.store.sessions.size >= 200) throw new AuthError("capacity");
      operation = "session_creation";
      const id = randomToken(), key = this.sessionKey(id), now = this.now();
      createdKey = key;
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
      await this.store.flush();
      if (!this.store.sessions.has(key)) throw new AuthError("unauthorized");
      return { id, profile: { ...profile }, expiresAt: now + SESSION_TTL_MS,
        chatRequested: required.includes(CHAT_SCOPE), housingRequested: required.includes(SUBSCRIPTION_SCOPE), communityRequested: required.includes(FOLLOWER_SCOPE) };
    } catch (error) {
      if (createdKey) this.store.sessions.delete(createdKey);
      authDiagnostic(operation, "failure", error);
      if (tokens) {
        try {
          const key = randomToken();
          this.store.revocations.set(key, { key, encryptedTokens: this.vault.seal(tokens, key), expiresAt: this.now() + 60 * 60 * 1000 });
          await this.store.flush();
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
    await this.store.ready();
    if (!isOpaqueToken(id)) return null;
    const profile = await this.profileByKey(this.sessionKey(id), forceValidation);
    await this.store.ready(); // Recheck ownership after potentially slow Twitch validation.
    return profile;
  }
  private async profileByKey(key: string, forceValidation: boolean): Promise<AccountProfile | null> {
    const session = this.store.sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.store.sessions.delete(key); this.queueRevocation(key, session); await this.store.flush(); return null;
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
        await this.store.ready();
        refreshed = await this.twitch.refresh(tokens.refreshToken);
        tokens = refreshed;
        if (this.store.sessions.get(key) !== session || session.expiresAt <= this.now()) {
          if (this.store.sessions.get(key) === session) this.store.sessions.delete(key);
          this.queueRevocation(key, { ...session, encryptedTokens: this.vault.seal(refreshed, key) });
          await this.store.flush(); return null;
        }
        // Preserve rotated credentials even if the following validation hits an outage.
        session.encryptedTokens = this.vault.seal(tokens, key);
        session.tokenFingerprint = this.vault.digest("access-token", tokens.accessToken);
        session.validatedAt = -Number.MAX_SAFE_INTEGER;
        await this.store.flush();
        validation = await this.twitch.validate(tokens.accessToken);
      }
      this.checkIdentity(validation, session.profile.twitchUserId);
      if (this.store.sessions.get(key) !== session || session.expiresAt <= this.now()) {
        if (this.store.sessions.get(key) === session) {
          this.store.sessions.delete(key); this.queueRevocation(key, session);
        } else if (refreshed) this.queueRevocation(key, { ...session, encryptedTokens: this.vault.seal(refreshed, key) });
        await this.store.flush();
        return null; // Sign-out or expiry during a network request cannot resurrect a session.
      }
      session.encryptedTokens = this.vault.seal(tokens, key);
      session.tokenFingerprint = this.vault.digest("access-token", tokens.accessToken);
      session.tokenExpiresAt = this.now() + validation.expiresIn * 1000;
      session.validatedAt = this.now();
      session.scopes = [...validation.scopes];
      await this.store.flush();
      return this.store.sessions.get(key) === session ? { ...session.profile } : null;
    } catch (error) {
      // Temporary upstream/storage outages deny this request but must not erase
      // the only durable refresh credential. Retry validation before trusting it.
      if (isAuthError(error) && error.code === "unavailable") {
        session.validatedAt = -Number.MAX_SAFE_INTEGER;
        throw error;
      }
      this.invalidateToken(session.tokenFingerprint);
      if (refreshed) this.queueRevocation(key, { ...session, encryptedTokens: this.vault.seal(refreshed, key) });
      await this.store.flush();
      throw isAuthError(error) ? error : new AuthError("invalid_token");
    }
  }
  async signOut(id?: string, csrf?: string) {
    await this.store.ready();
    if (!isOpaqueToken(id)) return;
    const key = this.sessionKey(id), session = this.store.sessions.get(key);
    if (!session) return;
    if (!csrf || !safeEqual(csrf, this.csrfToken(id))) throw new AuthError("forbidden");
    this.invalidateToken(session.tokenFingerprint); // Includes any sessions sharing this token.
    await this.store.flush(); // Never report sign-out success before durable deletion.
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
    return this.store.available() && !!session && session.validatedAt > 0 && session.expiresAt > this.now() && scopes.every((scope) => session.scopes?.includes(scope));
  }
  async chatCredentials(key: string, forceValidation = false) {
    return this.scopedCredentials(key, [CHAT_SCOPE], forceValidation);
  }
  async scopedCredentials(key: string, scopes: string[], forceValidation = false) {
    await this.store.ready();
    const profile = await this.profileByKey(key, forceValidation);
    await this.store.ready();
    if (!profile) throw new AuthError("unauthorized");
    const session = this.store.sessions.get(key);
    if (!session) throw new AuthError("unauthorized");
    if (scopes.some((scope) => !session.scopes?.includes(scope))) throw new AuthError(scopes.includes(FOLLOWER_SCOPE) ? "follower_scope" : scopes.includes(SUBSCRIPTION_SCOPE) ? "subscription_scope" : "chat_scope");
    return { profile, accessToken: this.vault.open(session.encryptedTokens, key).accessToken };
  }
  revokeChat(key: string) {
    const session = this.store.sessions.get(key);
    if (session) { this.invalidateToken(session.tokenFingerprint); void this.store.flush().catch(() => { /* Fail closed; maintenance retries durable deletion. */ }); }
  }
  /** Trusted server capability for an owner's current subscriber verification. Never serialize. */
  async subscriptionCredentialsFor(broadcasterId: string) {
    await this.store.ready();
    for (const [key, entry] of this.store.sessions) {
      if (entry.profile.twitchUserId !== broadcasterId || entry.expiresAt <= this.now() || !entry.scopes.includes(SUBSCRIPTION_SCOPE)) continue;
      const credentials = await this.scopedCredentials(key, [SUBSCRIPTION_SCOPE], true);
      if (credentials.profile.twitchUserId === broadcasterId) return { ...credentials, key };
    }
    throw new AuthError("subscription_scope");
  }
  private async flushRevocations() {
    await this.store.ready(); // A fenced maintenance run must not revoke the new process's grants.
    const pending = [...this.store.revocations].slice(0, 50);
    for (let offset = 0; offset < pending.length; offset += 10) {
      await Promise.all(pending.slice(offset, offset + 10).map(async ([id, entry]) => {
      try {
        const token = this.vault.open(entry.encryptedTokens, entry.key).accessToken;
        const fingerprint = this.vault.digest("access-token", token);
        // Twitch can reuse a grant in a newer login; don't revoke a live session's token.
        if (![...this.store.sessions.values()].some((s) => s.expiresAt > this.now() && s.tokenFingerprint === fingerprint)) await this.twitch.revoke(token);
        if (this.store.revocations.get(id) === entry) this.store.revocations.delete(id);
      } catch (error) {
        if ((isAuthError(error) && error.code === "invalid_token") || entry.expiresAt <= this.now()) this.store.revocations.delete(id);
        // Fail-closed locally; encrypted best-effort revocations retry on maintenance.
      }
      }));
    }
    await this.store.flush();
  }
  /** Called at startup and every minute, even without browser requests. */
  async maintain(forceValidation = false) {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      await this.store.ready();
      for (const [key, entry] of this.store.states) if (entry.expiresAt <= this.now()) this.store.states.delete(key);
      const keys = [...this.store.sessions.keys()];
      for (let offset = 0; offset < keys.length; offset += 10) {
        await Promise.all(keys.slice(offset, offset + 10).map(async (key) => {
          try { await this.profileByKey(key, forceValidation); } catch { /* Invalid sessions are removed; temporary outages remain fail-closed. */ }
        }));
      }
      await this.flushRevocations();
    } finally { this.maintenanceRunning = false; }
  }
}

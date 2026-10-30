import type { AccountProfile } from "./types";

export type PendingLogin = { bindingHash: string; expiresAt: number; chatUserId?: string; requiredScopes?: string[] };
export type StoredSession = {
  profile: AccountProfile; encryptedTokens: string; tokenFingerprint: string; scopes: string[];
  expiresAt: number; tokenExpiresAt: number; validatedAt: number;
};
export type Revocation = { encryptedTokens: string; key: string; expiresAt: number };

/** One long-running Node process only. Replace with atomic shared storage later. */
export class MemoryAuthStore {
  readonly states = new Map<string, PendingLogin>();
  readonly sessions = new Map<string, StoredSession>();
  readonly revocations = new Map<string, Revocation>();
  /** Durable implementations load/check their exclusive writer before use. */
  async ready() {}
  async flush() {}
  available() { return true; }
  consumeState(key: string): PendingLogin | undefined {
    const state = this.states.get(key);
    this.states.delete(key); // Synchronous read/delete: single use, including failed callbacks.
    return state;
  }
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MemoryAuthStore } from "./store";
import { AuthError } from "./types";
import type { RpcClient } from "../persistence/repository";
import type { Json } from "../persistence/types";

const key = z.string().regex(/^[a-f0-9]{64}$/);
const cipher = z.string().min(20).max(20000).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
const time = z.number().finite();
const session = z.object({ profile: z.object({ twitchUserId: z.string().regex(/^\d+$/), login: z.string().max(100), displayName: z.string().max(100), profileImageUrl: z.string().max(2048).nullable() }),
  encryptedTokens: cipher, tokenFingerprint: key, scopes: z.array(z.string().max(100)).max(100), expiresAt: time, tokenExpiresAt: time, validatedAt: time }).strict();
const snapshot = z.object({ sessions: z.record(key, session), revocations: z.record(z.string().max(128), z.object({ key: z.string().max(128), encryptedTokens: cipher, expiresAt: time }).strict()) }).strict();

/** Single-instance write-through store. A new process fences previous writers;
 * no OAuth tokens or raw browser session IDs ever enter database storage. */
export class DurableAuthStore extends MemoryAuthStore {
  private holder = randomUUID();
  private loaded = false;
  private loading?: Promise<void>;
  private active = false;
  private fenced = false;
  private confirmedAt = 0;
  private queue: Promise<void> = Promise.resolve();
  private dirty = false;
  constructor(private rpc: RpcClient, private clock = Date.now) { super(); }
  private assertNotFenced() { if (this.fenced) throw new AuthError("unavailable"); }
  private async call(name: "living_town_auth_claim" | "living_town_auth_check" | "living_town_auth_save", args: Record<string, Json>) {
    try {
      this.assertNotFenced();
      const result = await this.rpc(name, { p_holder: this.holder, ...args });
      if (result.error) {
        if (result.error.code === "LT409") this.fenced = true;
        console.warn(JSON.stringify({ event: "auth_storage", operation: name, category: result.error.code === "LT409" ? "inactive_process"
          : ["42P01", "42883", "PGRST202"].includes(result.error.code ?? "") ? "migration" : "unavailable" }));
        throw new AuthError("unavailable");
      }
      this.assertNotFenced(); // A delayed success cannot undo a concurrent ownership loss.
      return result.data;
    } catch { this.active = false; throw new AuthError("unavailable"); }
  }
  override async ready() {
    this.assertNotFenced();
    if (!this.loaded) {
      this.loading ??= (async () => {
        const parsed = snapshot.safeParse(await this.call("living_town_auth_claim", {}));
        if (!parsed.success || Object.keys(parsed.data.sessions).length > 200 || Object.keys(parsed.data.revocations).length > 1000) throw new AuthError("unavailable");
        for (const [key, value] of Object.entries(parsed.data.sessions)) {
          // Force validation on startup before any restored identity is trusted.
          this.sessions.set(key, { ...value, validatedAt: -Number.MAX_SAFE_INTEGER });
        }
        for (const [key, value] of Object.entries(parsed.data.revocations)) this.revocations.set(key, value);
        this.loaded = true;
      })();
      try { await this.loading; } catch { this.loading = undefined; this.active = false; throw new AuthError("unavailable"); }
    }
    const owner = await this.call("living_town_auth_check", {});
    if (owner !== true) {
      if (owner === false) this.fenced = true;
      this.active = false; throw new AuthError("unavailable");
    }
    this.active = true; this.confirmedAt = this.clock();
    if (this.dirty) await this.flush();
  }
  override available() { return !this.fenced && this.active && this.clock() - this.confirmedAt < 90000; }
  override async flush() {
    this.dirty = true;
    const task = this.queue.catch(() => {}).then(async () => {
      this.assertNotFenced();
      if (!this.loaded) throw new AuthError("unavailable");
      // Capture when this serialized write starts, so later queued mutations cannot
      // be overwritten by a snapshot captured before an earlier network request.
      const sessions = JSON.parse(JSON.stringify(Object.fromEntries(this.sessions))) as Json;
      const revocations = JSON.parse(JSON.stringify(Object.fromEntries(this.revocations))) as Json;
      if (await this.call("living_town_auth_save", { p_sessions: sessions, p_revocations: revocations }) !== true) {
        this.active = false; throw new AuthError("unavailable");
      }
    });
    this.queue = task;
    await task;
    this.assertNotFenced();
    if (this.queue === task) this.dirty = false;
    this.active = true; this.confirmedAt = this.clock();
  }
}

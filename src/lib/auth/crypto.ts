import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { OAuthTokens } from "./types";

export function randomToken() { return randomBytes(32).toString("base64url"); }
export function isOpaqueToken(value: string | undefined): value is string { return !!value && /^[A-Za-z0-9_-]{43}$/.test(value); }
export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Authenticated encryption at rest in the temporary server-side store. */
export class TokenVault {
  private encryptionKey: Buffer;
  private digestKey: Buffer;
  constructor(secret: string) {
    const key = Buffer.from(secret, "base64");
    this.encryptionKey = Buffer.from(hkdfSync("sha256", key, "living-town", "oauth-encryption-v1", 32));
    this.digestKey = Buffer.from(hkdfSync("sha256", key, "living-town", "session-digests-v1", 32));
  }
  digest(purpose: string, value: string) {
    return createHmac("sha256", this.digestKey).update(`${purpose}:${value}`).digest("hex");
  }
  seal(tokens: OAuthTokens, sessionKey: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(`living-town:tokens:v1:${sessionKey}`));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
  }
  open(sealed: string, sessionKey: string): OAuthTokens {
    const [iv, tag, encrypted] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAAD(Buffer.from(`living-town:tokens:v1:${sessionKey}`));
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") throw new Error("Invalid encrypted token record");
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  }
}

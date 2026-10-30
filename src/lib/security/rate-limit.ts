import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/** Single-process abuse budgets; never trust a client-provided forwarding IP.
 * Global buckets bound unauthenticated/rotated identities too. No raw cookies,
 * tokens, IPs or callback parameters are retained/logged. */
export class ApiRateLimiter {
  private buckets = new Map<string, { count: number; until: number }>();
  constructor(private now = Date.now) {}
  private consume(key: string, limit: number) {
    const now = this.now();
    for (const [k, value] of this.buckets) if (value.until <= now) this.buckets.delete(k);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= 2048) return false;
      bucket = { count: 0, until: now + 60000 }; this.buckets.set(key, bucket);
    }
    bucket.count++; return bucket.count <= limit;
  }
  check(request: NextRequest) {
    const path = request.nextUrl.pathname;
    if (!path.startsWith("/api/") || path === "/api/health") return null;
    const oauth = path.startsWith("/api/auth/twitch/") || path === "/api/chat/authorize";
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const category = oauth ? "oauth" : mutation ? "mutation" : "read";
    const credentials = request.headers.get("authorization") ?? request.cookies.get("__Host-living-town-session")?.value ?? request.cookies.get("living-town-session")?.value;
    const allowedGlobal = this.consume(`global:${category}`, oauth ? 60 : mutation ? 120 : 2400);
    const allowedIdentity = !credentials || credentials.length > 4096 ? !credentials : this.consume(`${category}:${createHash("sha256").update(credentials).digest("hex")}`, mutation || oauth ? 20 : 240);
    if (allowedGlobal && allowedIdentity) return null;
    return NextResponse.json({ error: "rate_limited", message: "Too many requests. Please retry in one minute." }, {
      status: 429, headers: { "Retry-After": "60", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  }
}

// HTTP-only production gate check. No browser, real login, or Supabase access.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
// Explicit environment values override .env.local without reading or displaying it.
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|HOME|PATHEXT)$/i.test(key))),
  NODE_ENV: "production", PUBLIC_DEPLOYMENT: "false", TOWN_DEMO_MODE: "true", AUTH_STORAGE: "memory",
  SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", TWITCH_CLIENT_ID: "synthetic-client", TWITCH_CLIENT_SECRET: "synthetic-secret",
  TWITCH_REDIRECT_URI: `http://localhost:${port}/api/auth/twitch/callback`, SESSION_SECRET: Buffer.alloc(32, 17).toString("base64"), NEXT_TELEMETRY_DISABLED: "1" };
const child = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)],
  { env, windowsHide: true, stdio: "ignore" });
const exit = once(child, "exit");
try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error("Production fixture server exited before ready");
    try { const r = await fetch(`${base}/api/demo/subscriber`, { signal: AbortSignal.timeout(1000) }); await r.text(); ready = true; break; } catch { await delay(500); }
  }
  assert.ok(ready, "Production fixture server did not start");
  for (const method of ["GET", "POST", "PATCH"]) {
    const r = await fetch(`${base}/api/demo/subscriber?demo=true`, { method, headers: { "x-demo": "true", "x-node-env": "development" }, signal: AbortSignal.timeout(10000) });
    assert.equal(r.status, 404, `${method} must be inaccessible in production`);
    assert.deepEqual(await r.json(), { error: "not_found" });
  }
  for (const route of ["/demo/subscriber/house", "/demo/subscriber/town"]) {
    const r = await fetch(`${base}${route}`, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    await r.text(); assert.equal(r.status, 404, `${route} must fail closed before authentication`);
  }
  console.log("Production subscriber demo: GET/POST/PATCH and both pages return 404, even with TOWN_DEMO_MODE=true. No Twitch or database requests.");
} finally {
  child.kill(); await exit;
}

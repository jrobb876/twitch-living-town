// HTTP/HMR protocol regression check, not browser automation. No real credentials,
// cookies, Twitch calls or Supabase access. Dev runs an isolated copy without .env.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd(), production = process.argv.includes("--production");
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(manifest.scripts.dev, "next dev --webpack", "Keep the verified development bundler until the HMR restart regression is resolved");
let cwd = root;
if (!production) {
  await mkdir(path.join(root, ".next"), { recursive: true });
  cwd = await mkdtemp(path.join(root, ".next", "overview-runtime-"));
  for (const file of ["src", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"])
    await cp(path.join(root, file), path.join(cwd, file), { recursive: true });
}
const reservation = createServer();
reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://localhost:${port}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(path|systemroot|windir|temp|tmp|userprofile|home|appdata|localappdata)$/i.test(key)));
Object.assign(env, {
  NODE_ENV: production ? "production" : "development", NEXT_TELEMETRY_DISABLED: "1",
  PUBLIC_DEPLOYMENT: "false", TOWN_DEMO_MODE: "true", AUTH_STORAGE: "memory",
  TWITCH_CLIENT_ID: "runtime-fixture", TWITCH_CLIENT_SECRET: "synthetic-not-a-credential",
  TWITCH_REDIRECT_URI: `${origin}/api/auth/twitch/callback`, SESSION_SECRET: Buffer.alloc(32, 7).toString("base64"),
  SUPABASE_URL: "", SUPABASE_SECRET_KEY: "",
});
const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"),
  ...(production ? ["start"] : manifest.scripts.dev.split(" ").slice(1)), "--port", String(port)],
{ cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
// Bound diagnostic output; print only on failure. The child has synthetic auth only.
let output = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-6000); });
let socket;
const messages = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Fixture server exited");
    try { ready = (await fetch(`${origin}/api/auth/session`, { signal: AbortSignal.timeout(2000) })).ok; } catch { /* Startup/compilation. */ }
    if (ready) break;
    await delay(500);
  }
  assert.ok(ready, "Session initialization must finish");
  for (const suffix of ["", "?utm_source=chatgpt.com", ""]) {
    const response = await fetch(`${origin}/town-overview${suffix}`, { redirect: "manual" });
    assert.equal(response.status, 200, "Overview must not redirect or reload its route");
    const html = await response.text();
    assert.ok(html.includes('id="town-title"'), "Overview heading must finish streaming");
    assert.ok(html.includes("MEET YOUR MAYOR"), "Mayor panel must finish streaming");
    assert.ok(html.includes("Twitch chat"), "Chat controls must remain mounted in the page");
    assert.ok(!html.includes('http-equiv="refresh"'), "No automatic document refresh");
    const sessionResponse = await fetch(`${origin}/api/auth/session`);
    assert.equal(sessionResponse.status, 200);
    assert.deepEqual(await sessionResponse.json(), { user: null, csrfToken: null, configured: true });
    if (!production && !socket) {
      const requestId = html.match(/self\.__next_r="([^"]+)"/)?.[1];
      assert.ok(requestId);
      socket = new WebSocket(`${origin.replace("http:", "ws:")}/_next/hmr?id=${requestId}`);
      socket.addEventListener("message", ({ data }) => { if (typeof data === "string") messages.push(JSON.parse(data)); });
      await once(socket, "open");
    }
    // Exercise API compilation while HMR is attached: these must not reload the page
    // or start/stop live Twitch connections. No session means a safe 401.
    for (const api of ["/api/chat/status", "/api/subscribers", "/api/town"])
      assert.equal((await fetch(`${origin}${api}`, { redirect: "manual" })).status, 401);
  }
  if (!production) {
    await delay(3000);
    assert.ok(messages.some((message) => message.type === "sync"), "HMR connection must be active, not disabled");
    assert.ok(!messages.some((message) => ["reloadPage", "turbopack-connected"].includes(message.type)),
      `Stable requests must not cause document restarts (HMR types: ${messages.map((message) => message.type).join(", ")})`);
    const settledCount = messages.length;
    await fetch(`${origin}/town-overview?utm_source=chatgpt.com`);
    await fetch(`${origin}/api/auth/session`);
    await delay(1500);
    assert.ok(!messages.slice(settledCount).some((message) => ["reloadPage", "serverComponentChanges"].includes(message.type)),
      "After initial route compilation, requests must not trigger repeated refreshes");
  }
  console.log(`${production ? "Production" : "Development"}: Overview/query/session/API isolation checks passed${production ? "" : "; active HMR issued no page reloads"}.`);
} catch (error) {
  console.error(output);
  throw error;
} finally {
  socket?.close();
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), delay(5000)]);
  if (!production) {
    // Only remove the unique fixture created by this invocation, never the
    // workspace's .next directory or an existing development server's output.
    assert.equal(path.dirname(path.resolve(cwd)), path.join(root, ".next"));
    assert.ok(path.basename(cwd).startsWith("overview-runtime-"));
    await rm(cwd, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  }
}

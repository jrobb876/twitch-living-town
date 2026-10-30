# Living Town: public deployment and recovery

Assessment date: October 29, 2026. Target: a small, supervised hackathon demonstration before November 2. **Code is prepared; deployment is conditional on manual migration, configuration and a real HTTPS/OBS rehearsal.** No hosting account, live database or external settings were changed during this work.

## Readiness assessment

| Priority | Finding | Outcome / release requirement |
| --- | --- | --- |
| Critical before deployment | Process-local sessions and encrypted credentials disappeared on restart. | Corrected with opt-in/private Supabase auth persistence, required for public production. Apply migration 006. Existing memory sessions cannot be migrated; sign in once after switching storage. |
| Critical before deployment | Public configuration could accidentally use a local callback or volatile storage. | `PUBLIC_DEPLOYMENT=true` requires production HTTPS; public production rejects `AUTH_STORAGE=memory`. Set both build/runtime flags from the checklist. Exact localhost HTTP remains supported for local tests only. |
| Critical before deployment | Sensitive API routes had no abuse budget. | Added bounded, process-local global and credential-hash budgets with 429/Retry-After. One instance only; use provider-level abuse protection before inviting broad traffic. |
| Critical before deployment | A build could explicitly include demo controls. | Public build rejects `TOWN_DEMO_MODE=true`; public deployment must set it false before building. Existing isolated local demos remain available. |
| Critical before deployment | Multiple processes could overwrite durable auth state. | New process claims fence previous auth snapshots. Never use autoscaling, multiple replicas, PM2 cluster mode, or previews/local durable-auth processes against the same database. Plan brief auth interruption on replacement. |
| Important before judging | A transient Twitch validation error erased credentials and browser cookies. | Corrected: unavailable requests fail closed, retain encrypted credentials/cookie, and require successful revalidation before access. Revocation, identity mismatch and expiry still invalidate. |
| Important before judging | Sockets, activity, sync jobs and pending subscriber delivery queues remain process-local. | Ordinary socket interruptions reconnect with bounded backoff; process restart requires **manual Connect Chat / Connect subscription events**, followed by Sync Subscribers. Recovery procedure below. |
| Important before judging | No readiness endpoint or deployment recipe. | Added `/api/health`, `render.yaml`, environment checks, security response headers and this runbook. Complete manual HTTPS, restart and OBS checks. |
| Important before judging | Provider/proxy logs may contain OAuth callback query strings or authorization headers. | Application logs omit secrets; configure hosting/log drains to omit callback query strings, Cookie/Authorization and request bodies. Verify this in a rehearsal without sharing values. |
| Safe to defer after hackathon | Distributed workers/leases, durable EventSub intake, background auto-restoration, broader quotas, CSP nonce rollout, large-scale performance profiling. | Explicitly deferred. Current implementation is not a horizontally scalable or lossless historical event service. |
| Safe to defer after hackathon | New Mayor animations, expanded-town OBS demo preview, new Twitch event types, isometric art, cosmetics, monetization. | No implementation in this milestone. |

## Architecture and provider choice

Use **one paid Render Node web service plus the existing Supabase project**. The same Node process serves Next.js, owns auth validation timers, runs subscriber sync and holds outbound Twitch EventSub WebSockets. No separate worker, Redis, new database or persistent filesystem is required for the demonstration. Node 24 is pinned in the supplied blueprint; Next listens on the provider's `PORT` at `0.0.0.0`. Render explicitly supports outbound WebSockets; a paid service avoids free-tier spin-down. [Render web services](https://render.com/docs/web-services), [outbound WebSockets](https://render.com/docs/websocket), [free-tier limits](https://render.com/docs/free).

Railway is a viable alternative: use one Node service/replica, the same commands/env, public HTTPS and **Serverless/App Sleeping disabled**. Its service architecture and outbound networking are suitable for this long-running client (an architectural assessment, not a provider-specific Twitch guarantee). Railway health checks gate deployment but do not continuously monitor after activation; configure an external uptime check. [Railway deployments](https://docs.railway.com/deployments), [outbound networking](https://docs.railway.com/networking/outbound-networking), [serverless settings](https://docs.railway.com/deployments/serverless), [health checks](https://docs.railway.com/deployments/healthchecks).

Do not use an ordinary serverless function deployment or sleep-on-idle plan. Both providers can replace containers during deploys; persistent auth does not make their sockets persistent. Render normally overlaps versions during deploys. The new auth writer fences the old writer, so old requests may briefly receive 503 while traffic changes. Do not promise zero-downtime authentication. Disable automatic deploys and rehearse a manual replacement outside the judging window. [Render deployment lifecycle](https://render.com/docs/deploys).

The limits remain 200 auth sessions, 100 channel entries, 1,000 pending subscriber events per channel, and the existing 494-plot town ceiling. Auth snapshots are bounded and serialized for a small demonstration; each validated session/refresh/logout is written before success. Authenticated requests also check process ownership in the database. This favors correctness over high-volume throughput.

## Durable auth security

Migration `006` adds one private auth runtime record and three server-only RPCs. It stores session-key HMACs, public account profiles, scopes, absolute expiry and AES-256-GCM encrypted OAuth credentials. It never stores raw browser session IDs or plaintext Twitch tokens. Encryption retains per-record authenticated binding and the existing server `SESSION_SECRET`. RLS is enabled; direct table access is revoked even from service_role; only the three entry RPCs are granted to that trusted role. Browser anon/authenticated roles cannot call them. No world, house, resident or OBS rows are rewritten.

Startup loads the durable snapshot and forces Twitch token validation before trusting restored sessions; the existing 30-minute validation interval and one-minute maintenance timer remain. This meets Twitch's startup/hourly validation requirement. Refresh is reactive to expired/invalid access tokens; rotated credentials are saved before their subsequent validation. Sign-out durably removes shared-token sessions before reporting success, retaining encrypted retryable revocation work. Eight-hour absolute sessions do not slide on restart. [Twitch validation requirements](https://dev.twitch.tv/docs/authentication/validate-tokens/).

Keep `SESSION_SECRET`, Twitch client ID/secret and the deployment origin stable across normal restarts. Changing the encryption secret invalidates old sessions/credentials; it is an intentional forced-reauth operation, not a routine deployment step. There is no atomic transaction spanning Twitch token rotation and PostgreSQL: a crash between them can still require reconnecting that account. Pending OAuth state intentionally remains memory-only: restart during authorization requires a fresh Connect with Twitch attempt.

A second app process that claims this database invalidates the first process's auth writer. Never share production auth storage with staging or local development. A database outage denies protected operations; it does not silently use memory auth. During transient validation/storage errors, live connections may stop because current authorization cannot be confirmed; reconnect manually after recovery. Saved OBS visuals continue independently of Twitch sessions.

## Environment checklist

Set secrets using the host's environment UI, never in tracked files, browser variables, Docker build arguments or pasted logs.

| Variable | Production requirement |
| --- | --- |
| `NODE_VERSION` | `24.22.1` in the Render blueprint (matches local runtime tested). |
| `NODE_ENV` | `production`. |
| `PUBLIC_DEPLOYMENT` | `true` at build and runtime. Enforces public HTTPS and excludes demo builds. |
| `AUTH_STORAGE` | `supabase`; requires migration 006. |
| `TOWN_DEMO_MODE` | `false` at build and runtime. Rebuild after changing it. |
| `TWITCH_CLIENT_ID` | Existing Living Town app's ID, server-side. |
| `TWITCH_CLIENT_SECRET` | Existing app secret, server-side. No rotation required just to deploy. |
| `TWITCH_REDIRECT_URI` | Exact registered `https://YOUR_HOST/api/auth/twitch/callback`, no query/fragment. |
| `SESSION_SECRET` | Stable random 32-byte base64 or 64-character hex key, server-side. Retain securely across redeploys. README has a local generation command; never share its output. |
| `SUPABASE_URL` | Existing HTTPS project URL. Use a separate development project for rehearsing migration/restart changes. |
| `SUPABASE_SECRET_KEY` | Server secret API key (`sb_secret_…`), never a publishable/anon key. |
| `PORT` | Supplied by provider; Next's start command honors it. |
| `NEXT_PUBLIC_TOWN_NAME`, `NEXT_PUBLIC_MAYOR_NAME` | Optional public demo labels, never credentials. Actual towns load saved names. |

Local development/localhost production defaults to memory auth unless `AUTH_STORAGE=supabase` is explicitly chosen. To test durability locally, use a development database and apply 001–006 there. `PUBLIC_DEPLOYMENT=false` preserves registered localhost testing with production Secure cookies; never use that local recipe as the public deployment settings.

## Manual deployment steps

1. Review the local changes and run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`. Review `render.yaml` before using it; it selects paid compute but nothing has been purchased or deployed. Commit/push only when you choose to publish the reviewed code.
2. Confirm which migrations have already been applied. Review/apply `202610290006_durable_auth.sql` **once, as a complete transaction**, after 001–005 using the same trusted database owner. Apply 005 first if still pending. Never rerun older files to prepare deployment. An accidental full-file rerun aborts at the existing table; do not bypass errors by executing fragments. Back up the database using your normal Supabase procedure before a production migration.
3. In Render, create a **Web Service** from the chosen repository/branch. Choose paid always-running compute, one instance, no autoscaling, and a region close to Supabase. Disable automatic deployments. Use `render.yaml` or enter its settings manually. Keep preview environments disabled or isolated on their own database.
4. Build command: `npm ci --include=dev && npm run build`. Start command: `npm start -- --hostname 0.0.0.0`. Health-check path: `/api/health`. No pre-deploy migration command. Set the listed environment variables, keeping secrets private.
5. Choose the final host/custom domain. In Twitch Developer Console → **Living Town** → OAuth Redirect URLs, add exactly `https://YOUR_HOST/api/auth/twitch/callback`. Set the same server variable. Keep the localhost registration if still needed locally. No scope expansion or client-secret change is required.
6. Trigger the deployment manually. `/api/health` must return HTTP 200 with only `{"status":"ok"}`. In public durable mode this verifies configuration, database/RPC reachability and active auth writer ownership; it does **not** claim Twitch is connected or prove all town features work. A 503 means resolve configuration/migration/storage/fenced-process issues before judging. Safe auth-storage logs identify `migration`, `inactive_process` or `unavailable` without exposing payloads.
7. Open `/api/auth/session`: expect `configured: true`. Sign in through `/account`, reload, and verify secure session persistence. Open your existing dashboard/town to verify the earlier schema/RPCs and ownership. Test a viewer account: it must not administer the broadcaster's town. Test sign-out and confirm protected routes no longer work.
8. Connect chat and subscriber events using the existing dashboard controls. Readiness requires confirmed EventSub subscriptions, not just a socket welcome. Send real chat in the exact channel; verify counters/activity. Run Sync Subscribers and check existing houses/layout/customization survive. Do not inject synthetic subscriber events into production.
9. Generate/copy the OBS URL from the HTTPS dashboard (an old localhost URL has the wrong origin). Treat its fragment key as private. Use 1920×1080/30 FPS, refresh the Browser Source cache, and verify both modes, transparency, chat and revocation. Close the dashboard; live updates should continue while the backend/session remain valid.
10. Rehearse the restart procedure below and record the time needed before inviting judges. Verify callback URLs, cookies and authorization headers are excluded from hosting/log-drain access logs. Keep one last-known-good build and a short demo recording available.

## Restart/redeploy recovery

After a normal restart, saved worlds, OBS access and unexpired durable login sessions survive. **Sockets, received-message counters, transient effects and running sync jobs do not. Automatic channel restoration is deferred deliberately; no connection-intent storage or competing reconnect worker has been added.**

1. Wait for `/api/health` to report ready. Refresh `/account` or dashboard. If the eight-hour session expired or Twitch revoked access, reconnect with Twitch; otherwise the existing cookie should restore your profile after validation.
2. Click **Connect Chat** and **Connect subscription events** for the signed-in broadcaster. Existing permission grants should not need another consent screen unless scopes were revoked. Repeated connect clicks reuse one channel connection; dashboard input cannot choose a foreign channel.
3. Wait for subscription readiness, send a new chat message, then run **Sync Subscribers**. Sync repairs current membership/allocation after missed deliveries; it cannot reconstruct missed chat or historical gift totals. Interrupted sync should be retried, not treated as completed.
4. OBS polls recover automatically using the same URL, but show disconnected activity until Twitch connections are restored. Do not replace that diagnostic with simulated events.
5. If a new deployment fails after claiming auth ownership, restart the retained/rolled-back app process so it can claim the store again. An old fenced process does not silently reclaim ownership and fight the replacement. During a routine socket/network interruption within the same process, existing EventSub reconnect/backoff/session-transfer logic continues to work.

## Rollback and operational limits

Disable auto-deploys during judging. On an application failure, choose the last known good **durable-auth-compatible** build in the hosting dashboard and restart it, retaining the same environment and `SESSION_SECRET`. Migration 006 is additive: leave it installed; do not drop auth/town tables or roll back housing transactions. Rolling back to pre-011A code discards durable-session support and is a last resort requiring sign-in/reconnect; never run that code alongside the new writer. Use a database backup restore only for a separately diagnosed data-loss incident, not a normal application rollback.

Rate budgets per minute: global OAuth 60, mutations 120, reads 2,400; per supplied session/bearer credential OAuth/mutations 20 and reads 240. Health is cached for five seconds and exempt. Forwarded IP headers are not trusted as identity, so spoofing them cannot bypass global limits. These limits reset on process restart, can be exhausted by abusive unauthenticated traffic, and are not a DDoS system. Provider WAF/rate controls and a distributed limiter are appropriate before broader adoption. Do not log bearer keys to tune the limits.

No new Twitch event types, worker services, production art, cosmetics or UI redesign were added. Remaining pre-submission work is manual migration/deployment, real HTTPS cookie/OAuth/OBS validation, restart rehearsal, access-log review and live demonstration preparation. Automated tests use synthetic Twitch responses and disposable local PostgreSQL; they cannot certify provider uptime, live permissions, browser visuals or real-network delivery.

## Local validation record

### Migration 006 security review (Prompt 011B)

Migration 006 is ready for manual application after 001–005 by the same trusted database owner; no SQL changes were required. The review tested it against populated towns, customized houses, Mayor settings, subscriber records and an enabled OBS grant. Existing rows and RPC definitions/permissions remained identical. An injected failure before COMMIT rolled back the new objects, and untrusted roles could not select the auth table or execute any of its three RPCs, even with broad default table grants. The service role successfully claimed, checked and saved through SECURITY DEFINER functions with an empty search path; direct table access remained denied.

Access/refresh tokens, including queued revocations, are encrypted before RPC serialization with AES-256-GCM, random 96-bit IVs, authentication tags and record-key associated data. Separate HKDF-derived encryption/HMAC keys come only from the server-side `SESSION_SECRET`. Session cookie IDs and token fingerprints are HMACed, not stored raw. **The entire JSONB document is not encrypted:** public profile fields, scopes, timestamps and opaque identifiers remain readable to trusted database administrators. Browser roles cannot access them. Server/browser responses use explicit public projections; diagnostics never serialize snapshots or exceptions. Keep the same secret across restarts; changing it requires signing in again.

The review corrected two application defects: saves now require an explicit `true` acknowledgement, and ownership loss is latched for the process so delayed successful checks cannot reactivate it. Auth also rechecks ownership after identity/credential validation and before refresh/revocation work. Tests cover delayed responses, failed and ambiguously committed writes, logout retries, and maintenance interrupted by a replacement claim. Successful SQL writes remain guarded atomically by the holder UUID; stale writers cannot overwrite the new snapshot.

**Overlap limitation:** this is not a distributed lease for all side effects. HTTP checks and auth writes consult the holder, but synchronous EventSub authorization uses cached availability (up to 90 seconds, normally refreshed by minute maintenance). Already-running requests or Twitch refresh/revoke calls cannot be cancelled atomically by a new database claim. Do not claim instantaneous cross-process revocation or zero-downtime rolling handoff. Prefer a controlled stop/start with the old process drained before replacement, accept brief downtime, and keep one instance. Never leave both versions serving intentionally; reconnect EventSub after restart. A lost response is reported as unavailable even if its transaction committed; a failed write followed by process loss may require reauthentication. Twitch refresh and PostgreSQL persistence cannot form one transaction.

Prompt 011B validation passed: lint, TypeScript, all 179 tests (including five new regressions), production build and Git whitespace checks. The earlier validation record below describes Prompt 011A.

October 29, 2026: ESLint, TypeScript, all **174 tests**, Next.js production build and Git whitespace checks passed. Migration 006 was exercised both on its own and after 001–005 in disposable embedded PostgreSQL. Tests cover durable restart, forced validation, expiry, refresh/outage recovery, sign-out, fenced writers, role privileges, channel reconnect authorization, rate budgets and safe health responses alongside the existing town/housing/OBS suites. `npm audit --omit=dev` reported zero known production dependency vulnerabilities; this is a point-in-time dependency check, not a full security certification. No live database, hosting account or automated browser was used.

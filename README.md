# Living Town

A cozy Twitch community you can watch grow, with subscriber cottages and a cat-like Mayor.

**Start here:** install Node.js 22 or newer, follow [Quick Start](#quick-start--development-evaluation), then open `/town-overview`. The simulation needs no accounts or database. Maplebrook requires your own Twitch app/login, but no Supabase or paid subscription.

[Repository](https://github.com/jrobb876/twitch-living-town) · [Hackathon demonstration](https://youtu.be/6hhecSsQ3aQ)

## What Is Living Town?

Living Town turns a streamer's Twitch community into a persistent, procedurally generated 2D village. Verified followers become residents; verified subscribers receive houses. A wandering Mayor welcomes community events, and two OBS presentations bring the town onto a stream. Built for the **Codex × TwitchCon Hackathon**.

## Features

- Seeded neighborhoods, connected paths, gardens, automatic housing expansion and an interactive PixiJS camera.
- Four Mayor appearances, personality variations, subscription/gift/follower reactions and reduced-motion support.
- Streamer onboarding, Dashboard, unified Twitch community connection, follower import and subscriber synchronization.
- Subscriber **My Houses**, exterior customization, saving and **Find My House** across towns.
- Twitch chat and verified follower/subscription EventSub listeners.
- OBS **Living Town · follow Mayor** and **Mayor Spotlight**, with town or transparent backgrounds.
- Isolated local event simulator, expanded OBS preview and Maplebrook subscriber fixture.

## Hackathon Demonstration Video

[Watch Living Town on YouTube](https://youtu.be/6hhecSsQ3aQ). Use the recording to see the full experience if you cannot configure Twitch or Supabase during evaluation.

## Quick Start — Development Evaluation

**Requirements:** Git, Node.js **22.0.0 or newer**, npm (included with Node), internet access for installation, and a modern browser with WebGL/hardware acceleration. Node 22 is the package minimum, including the Supabase SDK requirement; the Render blueprint pins 24.22.1. OBS is optional.

In PowerShell, macOS Terminal or a Linux shell:

```sh
git clone https://github.com/jrobb876/twitch-living-town.git
cd twitch-living-town
node --version
npm ci
```

Create your local environment file **once**; do not overwrite an existing configured file.

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

macOS / Linux:

```sh
cp .env.example .env.local
```

For all local previews, edit these settings in `.env.local`:

```dotenv
TOWN_DEMO_MODE=true
PUBLIC_DEPLOYMENT=false
AUTH_STORAGE=memory
```

Leave Twitch and Supabase credentials blank for now. Then:

```sh
npm run dev
```

Open **http://localhost:3000**, then **http://localhost:3000/town-overview** in a signed-out browser/private window. The startup banner uses **Webpack** intentionally. “Twitch connection is not configured” and a 503 session response with `configured: false` are expected until OAuth is configured; these do not block the credential-free demos.

Use `npm.cmd` instead of `npm` in PowerShell if script execution policy blocks `npm.ps1`; do not weaken the machine's policy. Stop the server with Ctrl+C. Keep `localhost` consistent for OAuth; `127.0.0.1` is not an interchangeable registered callback.

### A 5–10 minute judge walkthrough

Preparation/install/OAuth setup time is separate from this walkthrough.

1. **Minute 1:** explore `/`, then signed-out `/town-overview`. Pan, zoom and watch the Mayor wander.
2. **Minutes 2–3:** expand **Event simulator**. Try **New subscriber** and wait for the house assignment highlight and Mayor reaction. Try **Resubscription**, **Individual gift · simulated**, **Gift 2 subscriptions** and **New follower**. Use **Fill existing capacity**, then **Add 12 demo subscribers** to see neighborhood growth. These events affect the simulated source only.
3. **Minutes 4–5:** open `/demo/obs-preview`, select 25, 50, 100 or 200 houses and **Apply Preview**. Compare **Living Town · follow Mayor** with **Mayor Spotlight** and trigger the simulated reaction buttons. Optionally use **Open OBS capture view** in an OBS Browser Source at 1920×1080.
4. **Optional minute 6 — Twitch required:** after [OAuth setup](#twitch-oauth-setup), sign in at `/account`. In `/dashboard`, find **Development Tools** below My Town/My Houses and select **Try Subscriber Experience**. This activates Maplebrook without a paid subscription, Supabase or streamer onboarding.
5. **Optional minutes 7–10 — same login required:** find **My Home in Maplebrook** in Dashboard and `/my-houses`. Open its editor, change permitted exterior options, save, use **Find My House**, and visit the two-neighborhood town. Direct routes are `/demo/subscriber/house` and `/demo/subscriber/town` after activation. The fixture contains 15 simulated subscriber houses, including yours.

Without Twitch credentials, use `/demo/house-editor` for a separate practice cottage. It does **not** demonstrate authenticated Maplebrook ownership or persistent saving.

## Development Demo Features

| Experience | Route / entry | Requirements and limits |
| --- | --- | --- |
| Town + Event Simulator | `/town-overview` | Development, `PUBLIC_DEPLOYMENT=false`; signed-out access needs no credentials. Select the simulated source when a saved town is available. Real sources do not expose event injection. |
| Growth / Mayor / housewarming simulations | Event Simulator | Local simulated source; replay controls exercise deduplication. **Reset simulation** clears events/residents/growth but retains the seed. **Regenerate layout** also changes the seed. Neither writes a saved town. |
| Practice cottage | `/demo/house-editor` | Development without authentication; local demonstration, not a subscriber entitlement. |
| Expanded OBS preview | `/demo/obs-preview` | `npm run dev`, `TOWN_DEMO_MODE=true`, `PUBLIC_DEPLOYMENT=false`, host `localhost` or `127.0.0.1`. No login/database. Always unavailable under `npm start`. |
| Maplebrook | Dashboard / My Houses → **Try Subscriber Experience** | Same preview gates **plus genuine Twitch login**. No paid subscription or Supabase required. Always unavailable under `npm start`. |
| Development Tools navigation | `/dashboard` | Authenticated, same local preview gates. Links to OBS preview and Overview; navigation does not reset or switch the current town source. |

Maplebrook uses per-login server memory (up to eight hours, bounded to 50 sessions). Reset, server restart or a new login can discard its edits. Fictional MaplebrookLive is not a real subscriber entitlement.

**Signed in without Supabase?** Dashboard and My Houses can still show their development entry, but genuine town/property loading is unavailable. Signed-in Town Overview attempts saved-town access and may show “Your town is resting.” Use a signed-out private window for credential-free Overview and the signed-in window for Maplebrook.

## Twitch OAuth Setup

Use **your own Twitch account and application credentials**, never the developer's keys. Twitch requires verified email and two-factor authentication to register an application; see [Twitch's registration guide](https://dev.twitch.tv/docs/authentication/register-app/).

1. In the [Twitch Developer Console](https://dev.twitch.tv/console/apps), register an app using your own available name, website integration category and confidential client type for this server-side flow. Your app need not share the original “Living Town” name.
2. Register exactly `http://localhost:3000/api/auth/twitch/callback` as an OAuth redirect URL.
3. Put your Client ID and generated Client Secret only in ignored `.env.local` as `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. Set `TWITCH_REDIRECT_URI` to the exact registered URL.
4. Generate a session secret locally:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Put that private output in `SESSION_SECRET`; do not share or commit it. The application accepts exactly 32 random bytes encoded as standard Base64, or 64 hexadecimal characters. Keep the same secret across durable-auth restarts.
5. Fully restart Node. Open `http://localhost:3000/api/auth/session` and check only that `configured` is `true`. Visit `/account`, connect with Twitch and approve; you should reach `/dashboard`. Verify your profile and Sign Out. Do not share callback URLs, cookies or tokens.

Basic login requests no expanded permissions and does not prove subscription or town ownership. Maplebrook needs only this login. Real integrations need a saved streamer town, the broadcaster's own login and optional consent through **My Town → Community → Connect My Twitch Community**:

| Selected capability | OAuth scope | Additional prerequisite |
| --- | --- | --- |
| Live chat | `user:read:chat` | Authenticated channel and confirmed `channel.chat.message` subscription |
| Subscriber import / live subscriptions | `channel:read:subscriptions` | Broadcaster authorized to read that channel's subscriptions; Twitch eligibility/data availability applies |
| Follower import / live follows | `moderator:read:followers` | Broadcaster identity in this application and granted follower permission |

The unified flow retains existing grants, reports partial outcomes and offers recovery. Individual controls remain in **Advanced Settings & Troubleshooting**. Viewers cannot administer someone else's town. Genuine house saves require ownership and current membership verified through the streamer's authorized session; an evaluator without eligible channel/subscriber data cannot exercise every real housing operation.

See [Twitch authentication](https://dev.twitch.tv/docs/authentication/) and [Helix API reference](https://dev.twitch.tv/docs/api/reference/). EventSub uses outbound WebSockets: no local webhook tunnel, bot secret or additional environment variables are needed.

## Supabase Setup

**Skip this section for simulations and Maplebrook.** Create your own separate Supabase project for persistent towns; never use the developer's production project.

All six migrations and all nine server RPC entry points are in Git. Tests apply the SQL to disposable embedded PostgreSQL, including permissions, upgrades and rollback. No missing schema/RPC dependency was found in the source audit. **This audit has not provisioned or tested a fresh hosted Supabase project**, nor inspected the developer's live schema/history.

1. Create a project through [Supabase](https://supabase.com/dashboard). Its database password is not the application API key.
2. Obtain the project URL and a server-side **secret API key** (`sb_secret_…`) from connection/API-key settings. This application rejects publishable/anon keys and legacy JWT-format service-role keys. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
3. Review and manually apply these **complete files, once in order**, in the new project's SQL Editor as the same trusted database owner/administrator:

   | Order | File in `supabase/migrations/` | Adds |
   | --- | --- | --- |
   | 001 | `202610280001_persistent_towns.sql` | Town schema, projections, RLS, create/load/commit RPCs |
   | 002 | `202610280002_subscriber_housing.sql` | Subscriber evidence and sync projection |
   | 003 | `202610280003_house_portal.sql` | Owned-town lookup for My Houses |
   | 004 | `202610290004_neighborhood_expansion.sql` | Validated append-only growth |
   | 005 | `202610290005_obs_display.sql` | OBS settings and protected display access |
   | 006 | `202610290006_durable_auth.sql` | Durable encrypted-token sessions and process fencing |

4. Keep the Data API enabled with `public` exposed. Standard Supabase roles `anon`, `authenticated` and `service_role` must exist. No seed data, storage bucket, Supabase Auth provider or separate manual extension setup is required by these files. Do not add browser policies or helper grants.
5. Configure `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local`. Keep `AUTH_STORAGE=memory` for simplest local evaluation. Restart Node and sign in through Twitch.
6. Open `/dashboard`. A new project offers **Create My Town** via `/onboarding`; create your own town, then reopen `/town-overview` to verify automatic saved-town loading. There is no “Reload saved town” step. Authenticated `GET /api/town` should report `storage: "supabase"`; `town: null` before onboarding is normal. Unavailable storage does not silently create a replacement in memory.

See [Database setup/readiness checks](supabase/README.md). Migrations are transactional but **not idempotent**: never rerun applied files, drop existing tables, or run fragments to bypass an error. Track applications manually when using SQL Editor; the app never applies migrations automatically.

## Full Application Setup

After OAuth and all migrations are configured:

1. Sign in as streamer and complete `/onboarding` to choose the town and Mayor.
2. In `/dashboard/town`, use **Community → Connect My Twitch Community**, choose desired features, authorize, and inspect import/listener outcomes. A socket welcome alone is not subscription readiness.
3. Open `/town-overview` for the saved town. Send a real chat message in the connected channel and confirm its counter/activity. Subscriber import allocates verified houses; followers and chat alone do not grant houses.
4. A real subscriber signs in to `/my-houses` to customize their property. The streamer's valid subscriber grant must remain available for membership verification.
5. In `/dashboard/town#obs`, configure/enable display access, then copy its generated private Browser Source URL. Start at 1920×1080, 30 FPS and compare both modes. Real OBS needs a saved town and display grant; live reactions also need active Twitch listeners. OBS itself does not log into Twitch.

### Environment reference

Examples describe formats, not working credentials. Set secrets only in `.env.local` or your host's secret environment settings.

| Variable | Purpose / safe format | Required where; can omit? | Secret? |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_TOWN_NAME` | Simulated town label, e.g. `Willowbrook` | Optional everywhere; saved towns retain their names | No, public bundle |
| `NEXT_PUBLIC_MAYOR_NAME` | Simulated Mayor label, e.g. `Mochi` | Optional everywhere | No, public bundle |
| `TWITCH_CLIENT_ID` | Your app's Client ID | Required for login in any mode; simulations can omit | Public identifier, server-side |
| `TWITCH_CLIENT_SECRET` | Your app's generated secret | Required for login; simulations can omit | **Yes** |
| `TWITCH_REDIRECT_URI` | Local callback above; publicly `https://YOUR_HOST/api/auth/twitch/callback` | Required for login; exact path, no query/fragment | No |
| `SESSION_SECRET` | Random 32-byte Base64 or 64-character hex key | Required for login; simulations can omit | **Yes** |
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` | Required for genuine persistent features/durable auth; demos can omit | No, server config |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` from your project | Same as URL; both must be configured | **Yes** |
| `TOWN_DEMO_MODE` | `true` for isolated local demos; otherwise `false` | Default false; required for expanded preview/Maplebrook, not basic dev simulator | No |
| `PUBLIC_DEPLOYMENT` | `false` locally; `true` publicly | Set true at public build **and** runtime | No |
| `AUTH_STORAGE` | `memory` locally; `supabase` for durable auth | Local default memory; public production requires supabase + 006 | No |
| `NODE_ENV` | Next scripts select development/production | Do not override for normal local commands; production on host | No |
| `PORT` | Optional Next server port; normally `3000` locally | Optional; host may supply it. Changed local port needs matching registered callback | No |
| `NODE_VERSION` | `24.22.1` in `render.yaml` | Render runtime selection only, not your local Node version | No |

Next precedence, first definition wins: **shell/process environment → `.env.$NODE_ENV.local` → `.env.local` → `.env.$NODE_ENV` → `.env`**. `.env.local` is excluded in test mode. Keep env files at the repository root.

An explicitly empty shell `SUPABASE_URL` or `SUPABASE_SECRET_KEY` overrides a valid `.env.local` entry and prevents persistent loading. Remove stale overrides instead of blanking them. PowerShell: `Remove-Item Env:SUPABASE_URL, Env:SUPABASE_SECRET_KEY -ErrorAction SilentlyContinue`; macOS/Linux: `unset SUPABASE_URL SUPABASE_SECRET_KEY`. These commands change the current shell only. Reopen terminals if persistent OS settings also override values. Inspect variable names/presence, never paste values into issues.

Fully restart Node after configuration changes; auth/client instances are cached after initialization. `NEXT_PUBLIC_*` values are embedded at build. Set public/demo flags correctly **before build and runtime**, and rebuild after changes. Never prefix a secret with `NEXT_PUBLIC_`.

## Production Build and Runtime

### Local production rehearsal

Use your own OAuth configuration and development Supabase project. Set `PUBLIC_DEPLOYMENT=false`, `TOWN_DEMO_MODE=false`, `AUTH_STORAGE=memory` (or `supabase` only against that isolated development database), and the registered localhost callback.

```sh
npm ci --include=dev
npm run build
npm start
```

Stop the dev server first so port 3000 is free. Local production accepts the exact HTTP **localhost** callback while retaining Secure/HttpOnly cookies; use Chrome on localhost. Non-local production callbacks require HTTPS. A credential-free production build can serve public pages, but is not a full persistent evaluation.

Production hides the ordinary simulator/practice editor by default. An explicitly flagged isolated local production demo can enable those legacy surfaces; it **cannot** enable Maplebrook, OBS Development Preview or Dashboard Development Tools. Public builds reject `TOWN_DEMO_MODE=true`.

### Public deployment

Use **one continuously running Node instance**, all six migrations, your own Twitch credentials, stable `SESSION_SECRET`, `AUTH_STORAGE=supabase`, `PUBLIC_DEPLOYMENT=true`, `TOWN_DEMO_MODE=false`, and the exact registered public HTTPS callback. Use the flags at build/runtime. See [DEPLOYMENT.md](DEPLOYMENT.md) and [render.yaml](render.yaml). Do not use ordinary serverless functions, autoscaling or multiple auth writers.

OAuth tokens and pending revocations are authenticated-encrypted before storage; public profile metadata is not encrypted as a whole. Restored sessions revalidate with Twitch. A replacement fences the old auth writer: never run local/staging durable auth against production's database. Allow a brief interruption during replacement and reconnect community listeners afterward.

`/api/health` checks auth readiness, including storage in durable mode; it does **not** prove all town migrations, listener readiness or OBS output. It may return 503 in credential-free mode. Verify towns and real OBS separately. `npm run dev` is not a public deployment.

## Development vs Production Feature Matrix

**✓** functional with prerequisites; **△** partial/conditional; **—** unavailable. B–D assume your own complete OAuth/database setup and appropriate Twitch grants. A has no Supabase and optional OAuth. C uses default production demo flags; D uses secure public settings.

| Capability | A: Dev, no Supabase | B: Dev, Supabase + Twitch | C: Local production | D: Public production |
| --- | --- | --- | --- | --- |
| Public homepage | ✓ | ✓ | ✓ | ✓ |
| Twitch OAuth | △ own app required | ✓ | ✓ localhost | ✓ HTTPS |
| Authenticated Dashboard | △ login; real data unavailable | ✓ | ✓ | ✓ |
| Saved streamer towns | — | ✓ | ✓ | ✓ |
| Community imports | — | ✓ permissions/data required | ✓ same | ✓ same |
| Live Twitch via guided streamer setup | — | ✓ permissions/listeners required | ✓ same | ✓ same |
| Real subscriber housing | — | ✓ verified membership | ✓ same | ✓ same |
| My Houses | △ Maplebrook after login | ✓ real + optional demo | ✓ real only | ✓ real only |
| Maplebrook subscriber fixture | △ OAuth + preview gates | ✓ preview gates | — | — |
| Town simulator | ✓ signed-out | ✓ simulated source | — by default* | — |
| Event Simulator | ✓ simulated source | ✓ simulated source | — by default* | — |
| OBS Development Preview | ✓ preview gates | ✓ preview gates | — | — |
| Mayor event simulation | ✓ | ✓ simulated source/preview | — by default* | — |
| Persistent database storage | — | ✓ towns; auth optional | ✓ towns; auth optional | ✓ towns + auth required |
| Real OBS Browser Sources | — | ✓ saved town/display grant | ✓ same | ✓ same |
| Dashboard Development Tools | △ OAuth + preview gates | ✓ preview gates | — | — |
| Practice house editor | ✓ | ✓ | — by default* | — |

*Explicit isolated local `TOWN_DEMO_MODE=true` builds can enable basic simulator/practice editor only. Preview gates always require development, local hostname and the demo flag. Real OBS can show a saved town without live listeners; live reactions cannot.

## Testing

```sh
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Tests use synthetic Twitch responses and disposable PGlite PostgreSQL fixtures, not a live database. They cover all six migrations, RPC permissions, auth/CSRF, ownership, growth, demo isolation, navigation, reactions and OBS behavior. Use the committed lockfile via `npm ci`; include dev dependencies for tests/build even when the shell sets production mode.

Optional `npm run test:overview-runtime` checks development loading/HMR using isolated HTTP/WebSocket probes, not browser automation. Automated checks do not prove browser hydration, rendering performance, real Twitch grants or hosted Supabase setup. Manual Chrome/OBS checks remain necessary.

November 2 readiness audit: clean Windows `npm ci` installed 489 packages; TypeScript, lint, all 288 tests and production build passed in the isolated source copy with example configuration. HTTP-only probes verified credential-free demo pages and production preview/Maplebrook restrictions. Git diff checks passed. The working-tree credential-pattern scan found no candidates; it was not an exhaustive Git-history audit.

## Troubleshooting

| Symptom | Check / recovery |
| --- | --- |
| Cannot log in / “not configured” | Check all four OAuth variables, especially the session secret format. Restart Node; inspect only `configured` at `/api/auth/session`. Check shell overrides. |
| Invalid redirect URI | Match registration and variable exactly: port/path/hostname. Use localhost, not 127.0.0.1; public callbacks require HTTPS. |
| Dashboard cannot load saved town | Confirm both Supabase variables, Data API, all migrations and RPC grants. An empty new project is normal; unavailable storage is not. Do not regenerate/drop data as a repair. |
| Supabase values missing | Empty shell values override `.env.local`. Remove overrides, confirm root file location and restart. Never log keys. |
| Session expired / auth unavailable | Sign in again after eight hours or memory-mode restart. Durable auth needs stable secret, migration 006 and sole active writer. Resolve database/network outages before retrying. |
| Demo controls hidden | Use dev script, localhost, demo flag true, public flag false, then restart. Simulator requires a simulated source. Production restrictions are intentional. |
| Maplebrook unavailable / 404 | Same preview gates plus Twitch login. Activate **Try Subscriber Experience** on Dashboard/My Houses. No paid subscription or Supabase needed. |
| Overview rests after login without Supabase | Use signed-out private window for basic simulation or configure your own database for signed-in saved-town access. |
| Browser cannot reach localhost | Keep server running and wait for Ready. Use HTTP port 3000; stop conflicting servers. Another port also needs matching OAuth registration/config. |
| EventSub disconnected / no activity | Reconnect via **Connect My Twitch Community** after restart. Check per-feature outcomes and subscription readiness, not merely socket connected. Send a new message in the exact channel. Advanced diagnostics remain available. |
| OBS blank | Use current complete private URL with access enabled. Check reachability, dimensions and WebGL; refresh source. Preview URLs need running local dev server and preview gates. |
| Dev errors / repeated refresh | Use the Webpack dev script, restart after config changes, verify Node ≥22 and run `npm ci`. Do not build and run dev against the same `.next` output simultaneously. Share sanitized errors only. |

## Security and Data Isolation

- `.env.local`, secret env files/private keys and build/dependency output are ignored. `.env.example` contains no working credentials. Never commit Twitch/Supabase/session secrets or private OBS URLs.
- OAuth state, HttpOnly cookies, CSRF/origin checks, token validation and ownership checks remain enforced. Login, chat and simulated membership do not establish genuine subscriber entitlement.
- Supabase secret keys are trusted backend credentials; RLS does not protect against their misuse. Browser roles cannot call private RPCs. No browser endpoint accepts arbitrary saved worlds or fabricated verified subscriber events.
- Simulators/Maplebrook use isolated local memory and cannot write genuine ownership. Public production rejects demo builds; strict preview/fixture routes return 404 in production.
- Public visual projections include exterior names/settings, not private identity/entitlement records. Do not put private information in town, Mayor or house names.
- OBS URLs contain private display access. Share the recording, not those URLs. Exclude OAuth callback queries, cookies, headers and bodies from access logs/support screenshots.

## Limitations

- Maplebrook requires your own Twitch app/login; no guest-auth shortcut. The basic town, practice cottage and expanded OBS preview are credential-free.
- Real integrations/customization require accounts, grants and eligible channel data; an empty project cannot automatically demonstrate existing real subscribers.
- Source and SQL fixtures support fresh Supabase setup, but hosted project creation/gateway settings and real-account end-to-end behavior need manual verification. No live schema was inspected for historical drift.
- One active long-running Node process is required. Durable auth survives normal restarts; sockets, activity/reaction queues and in-flight jobs do not. Reconnect listeners/retry imports. Missed historical chat/gifts are not reconstructed.
- Bounded snapshots, sessions and town capacity target a supervised hackathon demo, not unlimited scale. Manually compare OBS modes at 1920×1080 on your hardware.
- Setup commands are cross-platform, but this audit's clean installation and automated checks ran on Windows with Node 24.22.1. macOS/Linux, fresh-account OAuth and a fresh hosted Supabase project were not exercised. No browser automation was performed.

## Technology Stack

TypeScript, Next.js App Router, React, Tailwind CSS, PixiJS v8, Twitch OAuth/Helix/EventSub WebSockets, Supabase/PostgreSQL, npm, Node's test runner and PGlite. No external art service is required.

Further detail: [Project specification](PROJECT_SPEC.md) · [Technical decisions](DECISIONS.md) · [Task tracker](TASKS.md) · [Database guide](supabase/README.md) · [Deployment/recovery](DEPLOYMENT.md).

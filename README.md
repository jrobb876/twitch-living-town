# Twitch Living Town

A cozy, seeded 2D village for the Codex x TwitchCon Hackathon, with a renderer-independent event simulation and Mochi, its cat-like Mayor. The original visual style remains the Town Overview. Twitch account connection is implemented; town events are still simulated and town changes are **not persisted**.

## Run locally

Use Node.js 22 or newer and npm. From PowerShell:

```powershell
cd F:\Development\TwitchLivingTown
npm install
npm run dev
```

Open **http://localhost:3000**. If PowerShell blocks `npm.ps1`, use `npm.cmd` in the same commands. On subsequent checkouts, `npm ci` installs the exact lockfile versions.

The town and simulator need no credentials. For Twitch account connection, configure the server variables below. If `.env.local` already exists, edit it without replacing your existing values. `NEXT_PUBLIC_*` values are public and must never contain secrets.

## Connect Twitch locally

The registered Twitch developer application is **Living Town**. Set these variables in the ignored `.env.local` at the repository root:

| Variable | Value |
| --- | --- |
| `TWITCH_CLIENT_ID` | Your registered application's client ID |
| `TWITCH_CLIENT_SECRET` | Your registered application's client secret |
| `TWITCH_REDIRECT_URI` | `http://localhost:3000/api/auth/twitch/callback` exactly |
| `SESSION_SECRET` | A random 32-byte secret encoded as standard base64 (44 characters) or hexadecimal (64 characters) |

Generate the session secret locally, then paste the output into `SESSION_SECRET` in `.env.local`. Do not share the output or commit it:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Restart `npm run dev` after configuring environment variables. Use **http://localhost:3000**, not `127.0.0.1` or another port: the origin and callback must match the registered redirect. No chat, moderation, subscription or email scopes are requested. Profile identity uses Twitch's Get Users API with an empty OAuth scope list.

### Manual login checklist (Chrome)

1. Open the Town Overview and select **Connect with Twitch**. Confirm Twitch shows the **Living Town** application and approve it. The callback redirects to `/account` with your display name, profile picture (when available), login and stable Twitch user ID.
2. Follow **Back to the Town Overview**. Your account appears in the header. Test Mayor movement, camera pan/zoom, regeneration and the event simulator using the existing checklist below. Login assigns no town, house or subscription status; simulation identities remain synthetic.
3. Reload `/account`: you should remain signed in. `/api/auth/session` returns only public profile fields and a logout CSRF value, never OAuth tokens. In Chrome Application → Cookies, `living-town-session` should be opaque, HttpOnly, SameSite=Lax and scoped to `/`. It is deliberately not Secure on local HTTP; production uses Secure `__Host-` cookies.
4. Select **Sign out**: the account disappears and `/api/auth/session` shows `user: null`. This signs out of Living Town, not Twitch's own website.
5. Start another login and cancel at Twitch. A safe cancellation message should appear. Visiting `/api/auth/twitch/callback` without parameters should report an unverifiable attempt; start again via the button. A callback URL can be used only once; do not share or save its code/state.
6. To check revocation, connect, then remove Living Town in your Twitch connections settings. The server detects revocation at its next validation (normally within 31 minutes), and the account UI refreshes on window focus or every five minutes. Restarting the Node server also invalidates all local sessions immediately. An idle session expires absolutely after eight hours.

Automated tests use synthetic credentials and mocked Twitch responses. A real Twitch login and browser interaction testing are intentionally left to you.

### Session and deployment limits

Auth currently requires **one continuously running Node process**. Opaque 256-bit cookie IDs refer to server-memory records; only HMAC digests of IDs are stored. Access/refresh tokens are AES-256-GCM encrypted using keys derived from `SESSION_SECRET`. OAuth state is browser-bound, single-use and expires after ten minutes. No credentials or tokens enter browser storage, client bundles or public session responses. Tokens are held transiently in plaintext only while making server-side Twitch requests.

Validation runs on login, startup re-entry, stale session reads, and a background timer every minute with a 30-minute freshness threshold, inside Twitch's hourly requirement. The owner guard forces fresh validation. Expired tokens are refreshed after Twitch rejects them, with rotated refresh tokens retained; unexpected revocation or unverifiable identity ends affected sessions. A Twitch validation outage fails closed and requires reconnection. Sign-out removes local sessions first and attempts revocation; encrypted pending revocations retry for up to an hour while the process remains running.

Session/state/revocation records disappear on restart; no tokens are persisted to disk. The prototype caps active sessions at 200 and pending login attempts at 1,000. Multiple replicas, serverless suspension and durable sessions require shared storage with atomic state consumption, refresh coordination and a scheduled validation worker before deployment. Future town mutations must use `requireTownOwner` with a trusted server repository; login alone grants no administration rights. No town mutation API exists yet.

For production authentication, register an **HTTPS** callback and configure `TWITCH_REDIRECT_URI` accordingly; plain HTTP is rejected in production. `npm start` over local HTTP remains useful for checking the town, but local OAuth testing should use `npm run dev`. Changing `SESSION_SECRET` requires a full process restart and invalidates sessions. Keep reverse-proxy/hosting access logs from recording callback query strings, authorization headers or token bodies. Next development callback request logging is suppressed in `next.config.ts`; infrastructure logging is configured separately.

## Controls

- Drag the village to pan; scroll over it to zoom toward the pointer.
- Use the on-screen plus, minus, fit, and arrow buttons (also suitable for touch).
- Focus the village with Tab: arrow keys pan, `+` / `-` zoom, and `0` fits the town.
- **Regenerate town** creates a new unsigned 32-bit seed and rebuilds the scene. The displayed seed identifies its generated data; reloading currently restores the starter seed `20261027`.
- The Mayor wanders between houses, the plaza and Town Hall, visits newly assigned homes and celebrates arrivals. Reduced-motion preference stops cosmetic movement; logical simulation and counters continue.

## Try the simulated interactions

Run `npm run dev`, open http://localhost:3000 and expand **Event simulator** below the village. All identities and events are simulated; no login is required.

1. **New follower:** residents increase; houses stay at 12. Watch for a welcome message and small resident actor.
2. **New subscriber:** an expansion home appears and receives an owner. The Mayor follows paths to visit it and celebrate. Camera zoom/pan should stay unchanged.
3. **Retry last event ID:** no extra resident, house or effect. **Resubscription** retains the subscriber's existing home and shows a welcome-back message.
4. **Gift 2 subscriptions**, then **Replay gift recipients:** the gift count and ownership remain unchanged on replay. The event log acknowledges the gifter. Two expansion plots are filled first; later owners receive existing unclaimed homes. After 14 owners, additional subscribers are waitlisted.
5. **Chat burst:** eight sample people raise activity and ambient movement. Repeatedly press **Repeated chat**: the same text/user earns no additional activity during the window. With no chat, the score fades to peaceful within 60 seconds.
6. **Incoming raid:** Town Hall welcomes 25 temporary visitors for 20 seconds; house/resident counts stay unchanged.
7. **Reset demo town:** clear events, owners, residents and activity while keeping the seed. **Regenerate town** also changes the seed. Reload restores the starter demo.

Production builds hide the simulator by default. For an explicitly authorized demo, set `TOWN_DEMO_MODE=true` in the build environment before `npm run build`. Rebuild with it unset or `false` to disable again. Setting it only at `npm start` does not change a previously prerendered page. This flag grants no backend privileges; there is no event mutation endpoint.

The browser needs WebGL and hardware acceleration. A loading state and retryable error message cover renderer startup failures. Town artwork uses local procedural graphics or inline SVG, with no art downloads or external font requests. Signed-in profile pictures load from Twitch's image CDN.

## Checks and production

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production build at http://localhost:3000 (see the HTTPS requirement for production authentication above). Stop a running server with Ctrl+C before starting another on that port. `typecheck` generates Next.js route types before checking TypeScript. Tests cover generation, simulation, OAuth state/callback failures, session cookies and encryption, expiry, validation/refresh/revocation, and tenant ownership guards. No tests contact Twitch or read local credentials.

Prompt 003 validation passed: lint, TypeScript, all 52 tests (including the original 18) and production build. Browser interactions are not automated, as requested; manually verify both checklists in Chrome. See TASKS.md for the remaining manual checks.

## Structure

```text
src/app/                         App Router page, metadata, global/Tailwind styles
src/components/town-experience.tsx  UI, seed state, Mayor portrait
src/components/town-canvas.tsx      Client-only loading and React lifecycle
src/lib/town/types.ts               Original deterministic layout types
src/lib/town/generate.ts            Pure seeded procedural generation
src/lib/town/generate.test.ts       Determinism and topology tests
src/lib/rendering/draw-town.ts      Programmatic village and Mayor artwork
src/lib/rendering/create-renderer.ts PixiJS lifecycle, animation and camera
src/lib/rendering/overview.ts       Shared-world to overview projection
src/lib/simulation/types.ts         Durable world, transient runtime, internal events
src/lib/simulation/world.ts         World/session construction and selectors
src/lib/simulation/engine.ts        Pure event handling and time advancement
src/lib/simulation/activity.ts      Rolling activity and spam suppression
src/lib/simulation/behavior.ts      Renderer-independent routing and behavior
src/lib/simulation/repository.ts    Future persistence boundary; in-memory example
src/lib/simulation/config.ts        Development/authorized-demo gate
src/components/event-simulator.tsx  Local simulated-event controls
src/components/twitch-account.tsx   Connect/sign-out controls and public profile
src/app/account/page.tsx            Account screen and safe auth feedback
src/app/api/auth/                   Login, callback, session and POST logout routes
src/lib/auth/                      OAuth client, encrypted memory sessions, HTTP handlers, ownership guard and tests
src/instrumentation.ts             Server startup validation/background lifecycle
```

The spatial layout uses a fixed connected block template. Seeds vary appearance and planting. New subscribers never trigger regeneration: two expansion plots and 12 unclaimed starter homes provide 14 ownership slots. Arbitrary district expansion, waitlist fulfillment and a customization editor are deferred. Runtime effects are not part of the saved-world shape. The UI session and example repository are in memory only; there is no disk/database persistence. Leaving the town for OAuth or the account page can reset the local demo, just like reloading it; account login does not persist gameplay state.

## Stack

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, ESLint and PixiJS 8. Exact versions are captured in `package-lock.json`. The application is initialized directly in the repository root.

See [PROJECT_SPEC.md](PROJECT_SPEC.md), [TASKS.md](TASKS.md) and [DECISIONS.md](DECISIONS.md) for the roadmap and architecture. Live EventSub/chat, subscription verification, persistence, realtime services, management portals and the OBS overlay are deferred.

Authentication references: [Twitch authorization code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow), [required token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), [refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/), [revocation](https://dev.twitch.tv/docs/authentication/revoke-tokens/), and [Get Users](https://dev.twitch.tv/docs/api/reference/#get-users).

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [PixiJS application lifecycle](https://pixijs.com/8.x/guides/components/application), [PixiJS graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics), and [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).

# Twitch Living Town — Task tracker

## Completed: foundation

- [x] Next.js/TypeScript/Tailwind/ESLint/PixiJS setup in repository root.
- [x] Seeded village with 12 homes, plaza, Town Hall, paths, landscaping and expansion areas.
- [x] Browser-only renderer, safe teardown, camera controls and regeneration.
- [x] Cat-like Mayor and coherent procedural overview artwork.
- [x] Documentation, environment template and ignore rules.

## Completed: functionality and simulated events

- [x] Inspect generator, types, React integration, renderer, Mayor behavior and tests before editing.
- [x] Preserve overview style, seeded initial homes and camera behavior.
- [x] Model versioned JSON-safe worlds, districts, plots, buildings, semantic appearance, Twitch-ID ownership and residents.
- [x] Separate transient runtime and effects from durable town data.
- [x] Add all six internal event types and typed outcomes.
- [x] Deduplicate deliveries and ownership within each town.
- [x] Reconcile aggregate/individual gifts, duplicate recipients and reverse delivery order.
- [x] Add fading chat activity, per-user cooldown and repeated-message suppression.
- [x] Move Mayor routing/behavior into pure simulation logic; add ambient residents.
- [x] Allocate expansion plots, preserve homes and report a full-town waitlist.
- [x] Show arrival, housewarming, welcome-back, gift and temporary raid effects.
- [x] Add collapsible development simulator, replay controls, reset and statistics.
- [x] Disable simulator by default in production with explicit build-time demo opt-in.
- [x] Define persistence interface and defensive-copy in-memory repository.
- [x] Test determinism, placement, retries, gifts, decay, transitions, restored snapshots and independent towns.
- [x] Update specification, decisions, README and environment example.

## Validation for Prompt 002

- [x] Final lint: passed with no errors or warnings.
- [x] Final TypeScript validation: passed.
- [x] Final tests: all 18 passed, including original generator tests.
- [x] Final production build: passed.
- [x] Development HTTP 200 and enabled simulator flag checked before interruption; final production HTML confirms `enableSimulator: false`.
- [x] Review confirms original generator/drawing code and camera controls are retained; event updates preserve the camera container.
- [ ] Full Chrome interaction verification: left to the user as requested. No automated browser interaction testing was performed after resuming. Follow the manual checklist in README.

## Next priorities

1. Exercise the simulator in-browser and tune effect visibility and Mayor priorities.
2. Add canvas lifecycle/camera retention integration tests and broader mobile/touch checks.
3. Implement incremental districts and housing waitlist fulfillment.
4. Design transactional PostgreSQL tables, durable tenant ownership, shared auth storage, validation workers, event retention and migrations.
5. Define Twitch adapter payload validation and stable gift correlation before live integration.
6. Add customization controls and public multi-town routing once persistence and ownership provisioning are ready.

## Completed: secure Twitch authentication (Prompt 003)

- [x] Inspect existing architecture and installed Next.js guides; preserve the Town Overview and simulation.
- [x] Implement server-side Authorization Code login/callback with minimal scopes and Helix identity.
- [x] Add cryptographically random, browser-bound, expiring, single-use OAuth state.
- [x] Use opaque HttpOnly/SameSite cookies, Secure host-only cookies in production, and eight-hour absolute sessions.
- [x] Encrypt server-held OAuth tokens with AES-256-GCM; keep credentials and tokens out of browser responses.
- [x] Validate on login/startup/stale reads and periodically without browser traffic; handle expiry, refresh, revocation and outages.
- [x] Protect sign-out with same-origin POST and session-bound CSRF; invalidate locally before remote revocation.
- [x] Add Connect with Twitch, account profile and sign-out UI without changing town gameplay.
- [x] Add trusted-repository ownership guard; grant no town ownership or subscription status through login.
- [x] Add credential-free service, HTTP and Twitch adapter tests; retain existing simulation tests.
- [x] Update environment template and documentation; keep `.env.local` ignored and unmodified.
- [x] Suppress Next development callback request logs; document infrastructure log redaction.

## Validation for Prompt 003

- [x] Final lint: passed with no errors or warnings.
- [x] Final TypeScript validation: passed.
- [x] Final full test suite: all 52 passed (34 authentication tests plus 18 original town/simulation tests).
- [x] Final production build: passed; town home remains static and auth/account routes are dynamic.
- [x] Git diff check passed; `.env.local` is ignored/untracked. Generator, renderer, camera, Mayor simulation and event simulator code remain unchanged.
- [ ] Real Twitch login, denial, sign-out and Chrome town regression checks: manual by user, per README. No automated browser interaction testing.

## Authentication limitations and follow-up

- One long-running Node process; restart loses sessions/state/revocation retries. No durable database or serverless/multi-instance support yet.
- Implement atomic shared auth storage, refresh coordination and validation scheduling before scaling. Current caps: 200 sessions, 1,000 pending login attempts.
- Register/configure HTTPS for production authentication; local HTTP OAuth uses `npm run dev`.
- Wire every future server town mutation through `requireTownOwner` with a trusted repository and mutation CSRF protection. No server town mutation endpoint exists in this phase.
- Provision actual town ownership and verify current subscriptions separately; never infer either from login or simulated events.
- Review hosting rate limits and redact callback queries/authorization data in infrastructure logs before public deployment.

## Deferred

Live EventSub/chat, Helix features beyond identity, Supabase/PostgreSQL, Fastify, Socket.IO, OBS, subscriber entitlement verification, customization editor, Bits, detailed isometric renderer, production art/audio and complex Mayor AI. All town changes and auth sessions remain in memory. No automatic commits or pushes.

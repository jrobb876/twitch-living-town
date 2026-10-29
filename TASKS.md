# Twitch Living Town — Task tracker

## Prompt 008 — Automatic neighborhood expansion

- [x] Inspect the generator, graph, saved-world schema, RPC guards, subscriber lifecycle and renderer before extending them.
- [x] Deterministic twelve-plot districts, four-plot reserve, stable geometry/ownership/customization and connected multi-direction growth.
- [x] Manual migration 004: append-only growth, existing transactional allocation/dedup/CAS, private helper and unchanged role boundary.
- [x] Preserve membership/waitlist after expansion rollback; new sync retries housing; total outages remain explicit failures.
- [x] Sync/live integration, fewer summary reads, neighborhood feedback and bounded Mayor tasks.
- [x] Larger camera bounds/Fit Town, offscreen culling, cached graph lookup and incremental house appearance updates.
- [x] Isolated demo buttons to fill capacity, add 12/48 subscribers, repeat growth and reset.
- [x] 137 tests pass: populated schema upgrade, role grants, competing allocations, sync/live overlap, SQL rollback, lost-response retry, reload, independent towns, geometry, customization, camera and 360/495 logical subscriber cases.
- [x] Final lint, TypeScript, production build and diff verification pass.
- [x] Update specification, decisions, setup, manual testing and performance limits.
- [ ] User manually reviews/applies migration 004 after 001–003 and tests Chrome rendering, existing portal, chat, camera and Mayor behavior.

Limits: 494 plots; full-snapshot/projection commits per subscriber; static roads/flowers; process-local delivery queues; no browser FPS benchmark. No live database access, browser automation, commit or push. Earlier fixed-14 capacity notes below describe superseded milestones.

## Prompt 007 — Subscriber house customization

- [x] Inspect Next.js guides and reuse existing auth, subscriber verification, property model, RPC commits and PixiJS artwork.
- [x] My Houses list across towns, composite property routes, empty/error/loading states and read-only legacy homes.
- [x] Shared preset editor: public name, roof/wall/door/fence, gardens and accents; preview, Save, Reset and unsaved indicators.
- [x] Server identity/CSRF/ownership/active-membership checks; fresh broadcaster-scoped verification; strict allowlist and revision conflicts.
- [x] Preserve protected/unrelated metadata; render saved appearance and selected public visual metadata.
- [x] Isolated DEMO HOUSE EDITOR and demo town using the existing development/presentation gate.
- [x] Migration 003 adds only a server-role-owned-town lookup; no automatic live migration.
- [x] Offline regressions: all 124 tests, lint, TypeScript and production build pass.
- [x] Update setup, manual demo/verified workflows, architecture and limitations.
- [ ] User manually applies migration 003 after 001/002 and tests Chrome visuals, saved reload and retained chat/Mayor/camera/simulator.

Limits: streamer authorization must be available in the same Node process for saves; no uploads/inventory, autosaved drafts or guaranteed cross-tab live updates. No live DB access, browser automation, commit or push.

## Migration 002 pre-application review

- [x] Review 001/002, server-only Supabase client, RPC privilege boundary and session/owner enforcement.
- [x] Confirm private helper/table revocations and nullable boolean expiry status are intentional; no functional SQL or application changes required.
- [x] Add SQL comments and manual application/rerun guidance.
- [x] Add disposable PostgreSQL tests for populated upgrade preservation, service-role create/load/commit, denied direct/browser access, cross-owner writes, expiry evidence and atomic rerun failure.
- [x] Lint, TypeScript, all 114 tests, production build and diff whitespace checks passed.
- [ ] Manual application by user using the same database administrator as migration 001. Live Supabase remains untouched.

## Prompt 006 — Verified subscriber housing

- [x] Reuse OAuth, validated server tokens, shared WebSocket, existing processor and transactional town repository.
- [x] Deliberate same-account subscription permission upgrade; preserve granted chat permission in either upgrade direction.
- [x] Paginated subscriber sync with stable Twitch IDs, idempotent homes, durable progress, partial failures and targeted absence verification.
- [x] Four version-1 live events: subscribe, subscription end, gift batch and resub message; registered-subscription routing and reconnection.
- [x] Gift recipient ownership, anonymous-safe batches, one batch celebration, and independent API reconciliation without invented correlation.
- [x] Permanent legacy homes, renewal retention, tier/gift/time evidence, available cumulative tenure and older-evidence protection.
- [x] Subscriber Housing panel, saved-world refresh, existing Mayor/effects and authenticated own-house lookup.
- [x] Preserve 14 stable slots; retain additional verified subscribers on an explicit waitlist.
- [x] Add migration 002 and offline regressions for authorization, pages, failure/retry, imports, duplicates, gifts, retention, ownership and shared sockets.
- [x] Update README, specification, decisions, environment comments and manual migration instructions.
- [x] Lint, TypeScript, all 109 tests, production build and diff review passed.
- [ ] User reviews/applies `supabase/migrations/202610280002_subscriber_housing.sql` after 001; no live migration is applied automatically.
- [ ] Manual Chrome: authorize, sync twice, connect four events, verify saved housing and existing chat/Mayor/camera/simulator. Follow README.

Limitations: fixed capacity/waitlist; no exact Twitch gift batch-recipient correlation; single-process jobs and event retry queue; no historical event recovery or subscriber customization editor. No browser automation, commit or push.

## Prompt 005 — Persistent towns

- [x] Inspect existing models, processor, housing, auth and live/demo integration; preserve the Overview.
- [x] Add typed Supabase repository, validated server configuration, structured errors and reused SDK connection.
- [x] Add reviewed migration for users, towns, Mayor, districts/plots, houses, residents and durable event receipts.
- [x] Enable RLS; revoke browser access; grant only intended server RPCs; authorize session/CSRF/owner on protected HTTP writes.
- [x] Add deliberate first-time town creation, database reload, Mayor name save and safe public projection.
- [x] Persist v1 layouts without regeneration; prepare resident/property storage through the existing processor and verified server adapter boundary.
- [x] Transactional event dedup, revision retry, concurrent housing uniqueness and rollback; stable house/plot identity.
- [x] Keep chat activity/movement and simulator out of persistent writes; clearly label unsaved demos and storage errors.
- [x] Add actual PostgreSQL migration, concurrency, authorization, reload, privacy and failure tests using disposable PGlite.
- [x] Document environment setup, manual migration, connectivity checks, security and production limits.
- [x] Final lint, TypeScript, all 96 tests (12 persistence cases) and production build passed. PostgreSQL migration/constraints were exercised offline; no live credentials were used by tests.
- [ ] User reviews/applies `supabase/migrations/202610280001_persistent_towns.sql` to the intended project and sets the two server variables.
- [ ] Manual Chrome/Supabase verification: create/reload after restart, second account, Mayor save, live chat, camera and isolated simulator.

Prompt 006 implements subscription scopes/ingestion. Customization UI, auth persistence and distributed sockets remain deferred. No live migration, browser automation, commit or push is performed by this implementation.

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
4. Add shared auth storage, validation workers, durable event retention and production rollout controls; transactional town storage and migrations are implemented in Prompt 005.
5. Add durable event intake/retention and production quotas. Keep Twitch gift aggregate counts separate from verified recipient ownership; no exact batch correlation is available.
6. Add public town browsing and subscriber customization controls after independently verified subscription entitlement.

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

Real follower/raid/Bits/Channel Points events, Fastify, Socket.IO, OBS, cosmetic inventory/uploads, new districts, detailed isometric renderer, production art/audio and complex Mayor AI. Prompt 007 adds exterior customization. Demo activity and auth sessions remain in memory. No automatic commits or pushes.

## Completed: EventSub chat (Prompt 004)

- [x] Inspect the existing auth, event domain, renderer and installed Next documentation; verify Twitch's current protocol.
- [x] Add deliberate `user:read:chat` authorization, granted-scope validation and same-account upgrade binding.
- [x] Keep OAuth credentials encrypted/server-side and preserve periodic validation/refresh.
- [x] Add one shared server-side WebSocket per channel, welcome-based subscription, keepalive watchdog, backoff and Twitch-directed handoff.
- [x] Reject malformed/foreign events; deduplicate stable Twitch chat message IDs and preserve spam/decay rules.
- [x] Apply chat through the existing processor without storing readable content or creating follower/subscriber records.
- [x] Add authenticated, CSRF-protected own-channel controls and private status/activity projection.
- [x] Wire live activity to existing Mayor/ambient movement and meter; retain independent development simulation and seeded generation.
- [x] Add source labels, channel/permission/connection status, last-event time, connect/reconnect/disconnect and source switching.
- [x] Add offline tests for permissions, sockets, routing, source separation, shared tabs and authorization lifecycle.
- [x] Update README, specification, decisions and environment template; no new secrets or worker command.

## Validation for Prompt 004

- [x] Final lint: passed with no errors or warnings.
- [x] Final TypeScript validation: passed.
- [x] Final full test suite: all 71 passed, including all original town/simulation/auth tests and 18 new chat integration/protocol tests.
- [x] Final production build: passed; home remains static and all four chat routes are dynamic Node handlers.
- [x] Diff check passed; `.env.local` remains ignored/untracked and unmodified. Renderer, camera, seeded generator and simulator component are unchanged.
- [ ] Manual Chrome: reauthorize the existing account, connect its channel, receive real chat, observe activity/decay, compare two tabs and exercise simulator/camera/regeneration. Follow README. No automated browser interaction testing.

## Prompt 004C — Chat delivery diagnosis

- [x] Trace subscription creation, own-channel/token checks, socket lifecycle, mapping, dedup and the existing processor. Live user trace identifies `invalid_message_id` after notification receipt.
- [x] Accept opaque delivery/chat IDs unchanged instead of enforcing a URL-safe alphabet; retain malformed-input bounds and exact-ID deduplication.
- [x] Reproduce and fix notifications lost before the subscription HTTP response; bound the pending queue and discard it on failure/stop.
- [x] Add development-only safe diagnostics and separate WebSocket/subscription readiness in the connection panel.
- [x] Add regressions for opaque IDs, broadcaster chat, duplicate delivery, early notifications, queue bounds/cleanup, invalid subscription responses and diagnostic privacy.
- [x] Final validation: lint, TypeScript, all 84 tests and production build passed.
- [x] Real-chat server trace after the correction: subscription HTTP 202 with all identity/status/transport checks passing; four messages accepted/count incremented, spam-credit suppression preserved, subsequent keepalive received.
- [x] User confirmed the browser message counter increased to four after the fix.
- [ ] User visual regression checks for activity display, camera/Mayor/simulator. No browser automation, commit or push.

## Chat limitations and next work

- Single continuously running Node process only. Restart clears sessions/connections/activity; full restart required after auth/service implementation upgrades.
- One-second activity polling; no public live-activity viewer, shared auth storage or multi-replica worker leases. Durable town ownership is implemented in Prompt 005.
- Maximum 100 channel entries; bounded live dedup/outcome/activity retention. No replay of messages lost during ordinary reconnects.
- Live scope covers chat only. Real event authorization, durable dedup, other channel events and subscription verification remain separate future milestones.

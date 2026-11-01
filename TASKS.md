# Twitch Living Town — Task tracker

## Prompt 020 — Unified Twitch community connection

- [x] Audit scope upgrades, session lifecycle, historical import/sync, shared EventSub readiness and duplicated controls; keep the existing OAuth/EventSub architecture and scopes.
- [x] Add optional feature selection and one guided Connect My Twitch Community action in My Town → Community, with individual permission/import/live outcomes and explicit retry/recovery.
- [x] Add owner/CSRF/origin-checked orchestration, bounded concurrent setup protection, quiet independent imports, completed-import skipping and one batched shared-socket start.
- [x] Add fixed-purpose OAuth return metadata with normal single-use state checks; consume recent same-town tab intent once, verify permissions server-side again and never automatically repeat OAuth after denial/failure.
- [x] Retain existing individual controls in collapsed Advanced Settings & Troubleshooting. Replace Overview management panels with compact status/link while retaining chat, subscriber presentations, saved-world refresh and authorized source/simulator controls.
- [x] Add synthetic regression coverage for missing/partial scopes, denial/return, duplicate attempts, import continuation/preservation, optional follower-only imports, partial listener failures, restart reconnection, tenant/CSRF boundaries and UI placement.
- [x] Final TypeScript, lint, all 267 tests (zero failures/skips), production build and tracked/new-file Git diff checks passed. Eleven new tests cover the guided flow and real import/persistence paths using synthetic gateways and disposable local PostgreSQL fixtures. Initial test-runner sandbox user-info failures were rerun successfully; no live services were used.
- [ ] Manual Twitch/Chrome/OBS checklist in README. No browser automation, live database changes, migrations, new scopes/types, OBS credential changes, commits, pushes or deployment.

## Prompt 019B — Town Overview loading loop

- [x] Compare all uncommitted Prompt 019 changes with the last committed version; retain completed reactions. Trace Overview, account provider, loading boundaries, saved-town/chat/subscriber polling, stable renderer initialization and navigation.
- [x] Reproduce development HMR `restart` instructions for the shared runtime chunk using HTTP/WebSocket protocol probes, including public home with and without the tracking query. Next's runtime maps these instructions to document reloads; the browser's repeated Fast Refresh messages agree. No React/auth redirect loop was found.
- [x] Change only the default development bundler to Webpack; retain HMR, authentication checks, application polling, production bundling and all town/OBS code.
- [x] Add isolated runtime checks plus session/Overview rendering and bundler regression tests. Existing reaction, live connection, durable auth and saved-town tests remain in the full suite.
- [x] Final TypeScript, lint, all 256 tests (zero failures/skips), production build, isolated development HMR/HTTP check, production HTTP check and tracked/new-file Git diff checks passed. Runtime probes use synthetic memory auth and no database credentials; existing durable-auth and local PostgreSQL fixture tests remain passing.
- [ ] Manual Chrome/OBS retest after fully restarting the development server. Upstream Turbopack's internal invalidation cause remains unverified; HTTP tests do not execute browser hydration/Pixi.
- [x] User confirmed both Overview URLs stay usable without the loading loop after restarting with Webpack.
- [ ] Investigate subsequent manual report of a persistent "Checking account…" label. The dev log shows a blocked HMR origin from 127.0.0.1; retry on the registered localhost origin and inspect whether the browser session request is missing, pending or completed before changing authentication.

## Prompt 019 — Mayor event celebrations and OBS reactions

- [x] Recover interrupted task: working tree clean; earlier patch was rejected before any files changed. Preserve Prompt 018 and reuse the completed audit.
- [x] Shared normalized cue, priority/duration/safe labels/visual metadata, pure per-view bounded queue and deterministic animation poses.
- [x] Subscriber hop, resub dance, individual gift wave, larger verified gift-batch celebration/count and optional genuinely-new-follower wave. Historical import/sync stays quiet.
- [x] Integrate existing verified presentations with Overview and both OBS modes; pause/resume the Mayor without changing resident, subscriber, house or expansion reconciliation.
- [x] Preserve four appearances; subtle energy variation, reduced-motion changes, fixed particle pools, cleanup and Spotlight effect bounds including transparent mode.
- [x] Conservative gift-only coalescing without guessed batch relationships; unrelated normal subscriptions/resubs retain queue eligibility. Bound continuous playback and retain initial-buffer/duplicate protection.
- [x] Add individual gift to the existing simulator and transient reaction buttons to the authorized local OBS preview, with persistent simulated labels and capture display settings.
- [x] Add mapping, verified presentation, burst/priority/bounds, dedup/replay, graphics/personality/reduced-motion, both OBS modes, disposal and no-world-mutation regressions. Update old movement tests to distinguish immediate reactions from later existing house visits.
- [x] Final lint (zero warnings), TypeScript, all 254 tests (zero failures/skips), production build and tracked/new-file diff checks passed. Ten tests added, with existing verified housing presentation assertions strengthened. Existing disposable PostgreSQL fixtures only; no live service verification. One focused test invocation hit the Windows sandbox user-info error and passed execution after approved escalation; the full suite ran via the existing npm test command.
- [ ] Manual real Twitch and 1920×1080 OBS/Chrome checks in README. No browser automation, live database changes, migration execution, commits, pushes or deployment.

## Prompt 018 — Community Import and live follower integration

- [x] Inspect and reuse OAuth/session protection, subscriber synchronization, persistent CAS/event receipts, shared EventSub and onboarding.
- [x] Add `moderator:read:followers`, same-account scope upgrades, paginated authenticated follower identities, bounded retries/rate-limit handling and explicit incomplete results.
- [x] Persist import phase/counts/error/lease in the existing world JSON; checkpoint, prevent duplicate claims, retain saved members on interruption and retry idempotently. No new migration required.
- [x] Reuse subscriber reconciliation and existing-house-first expansion; preserve customized homes, town/Mayor and cross-town identity isolation.
- [x] Add optional onboarding/management Community Import UI, counts, progress/loading, permission recovery, Retry and independent live-follow controls.
- [x] Register/verify `channel.follow` v2 on the shared socket; durable dedup and existing newcomer behavior only for genuinely new residents. Historical imports settle quietly in Overview and OBS.
- [x] Add focused synthetic API/socket/HTTP and disposable PostgreSQL regressions for empty/follower/subscriber/overlap cases, 205 paged followers, expansion, duplicate requests/deliveries, leases/restarts, failures, permissions and preserved customizations.
- [x] Final TypeScript, lint, all 244 tests (zero failures/skips), production build and tracked/new-file Git diff whitespace checks passed. Fourteen regressions added; tests use synthetic Twitch responses and the existing disposable local PostgreSQL fixtures, never live Supabase. The successful-commit outcome is now returned for accurate new-house counts; unsupported subscriber access retains its specific error category.
- [ ] Manual real Twitch import/follow and 1920×1080 OBS checks in README. Live Twitch and live Supabase behavior has not been verified by this task; no browser automation, live migrations, commits, pushes or deployment.
- [ ] Future: durable follow delivery queue, distributed workers, resumable cursors/batched storage for channels beyond the current bounded full-world importer.

## Prompt 017C — Adaptive density and large-town rendering

- [x] Audit before editing: global oldest-24 creation/simulation cap in Overview/previews; separate four-ambient production OBS fallback; no resident viewport culling; same rules in both OBS modes.
- [x] Scale visual pool to actual unique population up to 256; sample across populated districts above the cap. Preserve same-town motion, deterministic hydration, newcomer behavior, counts, housing and demo/tenant isolation.
- [x] Add resident screen-space overscan/hysteresis and fade-in, hide distant graphics and skip interpolation without camera-driven pool churn or world reconstruction. Suppress background resident drawing in transparent-only Spotlight.
- [x] Add authorized, bounded opaque OBS visual roster; preserve private-world projection and bearer checks. Aliases rotate on process restart without durable writes or replayed arrivals.
- [x] Nine new regressions cover 0/12/30/60/100/200, both modes, district coverage, privacy, refresh, overscan, 300-resident sampling and 10,000-record boundedness. All 230 tests and TypeScript passed.
- [x] Final lint, production build and tracked/new-file Git diff whitespace checks passed. TypeScript and all 230 tests passed; no failures/skips. Git reports only Windows LF/CRLF normalization notices. Existing disposable local database fixtures were used by the full suite; no live database connection or migration command was issued.
- [ ] Manual 1920×1080 Chrome/OBS performance and density checks in README. No browser automation, live database changes, migration commands, commits, pushes or deployment.

## Prompt 017B — Housing allocation, population and neighborhood consistency

- [x] Prioritize existing unassigned cottages in the shared simulator/trusted persistence processor; retain legacy/customized properties, reserve threshold, transactional receipts and concurrent allocation guards. No migration required.
- [x] Share conceptual neighborhood count (one initial settlement plus confirmed expansions) across Overview, Dashboard, management, visitor, simulator and expanded OBS preview. Distinguish available housing from vacant plots.
- [x] Add per-view initial-buffer baselines and unexpired-event deduplication to Overview/OBS; preserve reconnect cursors and independent concurrent views without global consumption or stored credentials.
- [x] Reconcile up to 24 stable resident actors on saved-world changes; preserve matching motion/graphics, distribute established residents without arrival effects, remove stale actors and keep demo/tenant isolation.
- [x] Add focused allocation, initial/expanded count, per-view refresh/reconnect, resident reconciliation/cap/isolation, UI label and persistent legacy/concurrency/rollback coverage; preserve existing gifts and entitlement tests.
- [x] Lint, TypeScript, all 221 tests (zero failures/skips), production build and tracked/new-file Git diff whitespace checks passed. Nine tests added beyond 017A; existing allocation expectations updated. Initial test failure was an outdated absent-vs-empty customization expectation, corrected without changing persistence behavior. Only Windows LF/CRLF normalization notices remain.
- [ ] Manual Overview/demo/OBS verification using README. Live Twitch connectivity and visual performance are not proven by synthetic tests. No browser automation, live database operations, migration changes, scopes, commit, push or deployment.

## Prompt 017A — Population, housing and event audit

- [x] Document actual counter formulas and initial values, saved/demo sources, identity lifecycle, exact reserve threshold and construction sequence in POPULATION_EVENT_AUDIT.md.
- [x] Trace known/unresolved gift batches, verified live membership, Mayor tasks, OBS queues and missing live integrations. Record refresh replay, actor reconciliation and inconsistent labels as follow-up work; do not silently redefine neighborhood counts.
- [x] Add four deterministic regressions covering lifecycle counters, five known recipients, unresolved five-gift batches, hydration without durable event replay, and built-house counts around expansion.
- [x] TypeScript, lint and all 212 tests passed (synthetic data and existing disposable local database fixtures).
- [x] Production build and tracked/new-file Git diff whitespace checks passed; Git emitted only the existing Windows LF-to-CRLF normalization notices. No browser automation, live database operations, commit, push or deployment.
- [ ] Separate implementation decisions: housing/neighborhood terminology, refresh-safe presentation delivery, live actor reconciliation, gift explanations and additional event reactions/ingestion. No runtime behavior, migrations, production data, permissions or animations changed by this audit.

## Prompt 016B — Simplify Town Overview controls

- [x] Trace reload (authenticated GET only) and regeneration (new in-memory demo seed/remount, no persistence mutation).
- [x] Remove routine reload from Overview; preserve mount/focus/town-event refresh and add contextual abortable Retry for loading failures, retaining the last saved town on temporary errors.
- [x] Keep Manage My Town available from initial saved data. Move regeneration into an authorized simulated-view development section, with matching handler guards and no production exposure.
- [x] Preserve Reset demo town, settings reload, subscriber synchronization, renderer/camera/Mayor and OBS operations elsewhere.
- [x] Add read/retry/recovery/abort and UI visibility regressions; all 208 tests, TypeScript, lint, production build and tracked/new-file Git diff checks passed.
- [ ] Manual Chrome checks for failure/retry and development demo regeneration; no browser automation, live database changes, commit, push or deployment.

## Prompt 016 — Public home, navigation and UX consolidation

- [x] Preserve and relocate the original interactive TownExperience at `/town-overview`; initialize authorized owners from their saved world and retain camera/Mayor/Twitch/demo wiring. Update scope-upgrade returns and expanded-demo reset to the relocated route.
- [x] Add a public, authentication-aware welcome page with an isolated fictional renderer preview and explanation; no private account/world or simulator access from the landing preview.
- [x] Share account polling and responsive primary navigation; exclude OBS and isolated expanded preview from website chrome/auth polling. Simplify dashboard actions and retain contextual property breadcrumbs.
- [x] Group existing management forms into linked Town & Mayor, Community and Stream Display sections, retaining drafts and existing #settings/#obs links. Enlarge visitor viewport.
- [x] Add shared CSS/SVG Mayor loaders, accessible status messages, reduced-motion handling, compact pending states, error recovery and lightweight page fades.
- [x] Navigate home only after successful server-side logout; preserve origin/CSRF/persistence checks and failure behavior.
- [x] Lint, TypeScript, all 204 tests, production build and Git diff checks passed. Added seven navigation/loading/Overview regressions; existing authentication, housing, camera, expansion and OBS suites remain green. One redirected test launch failed in the Windows sandbox before execution; the permitted full-suite retry passed.
- [ ] Manual Chrome desktop/tablet/mobile, keyboard, reduced-motion, saved/live town and OBS checks using README. No browser automation, live database changes, migrations, scopes, OBS credential changes, commit, push or deployment.

## Prompt 015 — Unified dashboard and login navigation

- [x] Resume partial hub/OAuth work; preserve existing management controls at `/dashboard/town` and default basic login to `/dashboard` only after persisted success.
- [x] Add protected hub states for neither/one/both roles, section-specific errors, loading states, Mayor configuration summary, account/sign-out and settings/OBS navigation.
- [x] Share owner-filtered house cards, optional broadcaster attribution, lazy existing previews and correct cross-town Visit/Edit links with My Houses.
- [x] Add read-only `/towns/[townId]` using the existing public projection, camera and Mayor animation; no new public directory or private metadata exposure.
- [x] Update OAuth failure/redirect tests; add dashboard data and server-rendered UI coverage for roles, partial failure, authorization, public projection and action destinations. Existing persistent sign-out/restart tests remain applicable.
- [x] TypeScript, lint, all 197 tests, production build and Git diff checks passed. Initial sandbox test launch failed before test execution on Windows user lookup; the permitted retry passed using synthetic services/disposable local databases.
- [ ] Manual Chrome desktop/mobile navigation and visual checks using README instructions. No browser automation, live database changes, migrations, OBS token rotation, commit or deployment.

## Prompt 014 — Unified identity and multi-town audit

- [x] Review migrations 001–006, contextual roles, pre-login allocation, cross-town discovery/editing, subscription reconciliation and private RPC boundaries. Findings: [MULTI_TOWN_AUDIT.md](MULTI_TOWN_AUDIT.md).
- [x] Add integrated regressions for one account owning a town and pre-existing properties elsewhere, neighbor/foreign-town denial, and independent duplicate sync/expiry/restoration across broadcasters.
- [x] Lint, TypeScript, all 192 tests, production build and Git diff checks passed. No runtime code, schema, live data or entitlement-policy changes.
- [ ] Separate prompt: broadcaster attribution and correct public town visit links, then a unified account landing page.
- [ ] Separate design: broadcaster grant lifecycle independent of interactive sessions if continuous editing is required; Extension JWT/identity-sharing adapter and bounded OBS interactions. No Extension or entitlement-policy changes in this audit.

## Prompt 012 — Local expanded-town OBS preview

- [x] Add separately gated localhost preview: explicit demo flag required, production denied even with the flag enabled; no preview mutation/API endpoint.
- [x] Generate exact deterministic 25/50/100/200 totals using existing subscriber allocation and district expansion, fictional identities and existing exterior presets.
- [x] Reuse both OBS modes, show persistent demo labels/counts, provide standalone capture URLs and reset navigation to the unchanged Overview.
- [x] Keep state in memory, cap actors, reuse geometry/mode resources and dispose timers/renderers during switching/unmount/late initialization.
- [x] Lint, TypeScript and all 190 tests pass, including nine preview regressions and existing expansion/OBS authorization suites.
- [x] Production build and Git diff checks pass. Direct HTTP checks on a temporary production server with real credentials disabled returned 404 for control/capture routes despite TOWN_DEMO_MODE=true, and for the absent preview API. The temporary server was stopped.
- [ ] Manual Chrome/OBS 1920×1080 visual/performance check. No FPS measured, browser automation, live database changes, migrations, commit or push.

## Prompt 011C — Persistent-auth logout 403

- [x] Trace native form navigation plus global no-referrer policy to null Origin and rejection before cookie lookup, CSRF evaluation or durable sign-out. The rejected request does not revoke its session.
- [x] Replace native submission with fixed-target CORS-mode fetch, same-origin credentials, session CSRF, redirect rejection and explicit JSON acknowledgement. Keep strict server Origin checks and secure cookies unchanged; report failure in the UI.
- [x] Test missing/null/malformed/foreign Origin rejection, restored production-cookie logout, cookie expiry, persistent deletion across another restart and failed client acknowledgements. All 181 tests, lint and TypeScript pass.
- [x] Final production build and Git diff checks pass.
- [ ] Manual Chrome production-mode retest using README. No live database changes, browser automation, commit, push or deployment.

## Prompt 011B — Persistent authentication security review

- [x] Verify encryption/key handling, server-only access, private RPC grants, restart recovery and failure boundaries. Migration 006 requires no SQL correction.
- [x] Require positive save acknowledgements and permanently latch detected ownership loss against delayed responses; recheck ownership before refresh/revocation and after identity validation.
- [x] Add regressions for stale responses, failed/ambiguous writes, fenced maintenance and non-destructive application to populated 001–005 schema. All 179 tests pass.
- [x] Document plaintext metadata versus encrypted credentials and the bounded EventSub cache/in-flight overlap limitations in DEPLOYMENT.md.
- [x] Final lint, TypeScript, production build and Git diff checks pass for this review.
- [ ] Manual application/deployment rehearsal only; no live database, browser automation, commit, push or deployment performed.

## Prompt 011A — Production readiness

- [x] Review OAuth, EventSub, subscriber ownership, private RPC/RLS, OBS grants and process-local dependencies; classify release findings in DEPLOYMENT.md.
- [x] Add durable encrypted auth with startup validation, serialized writes, process fencing, absolute expiry and persistent revocation work. Local memory mode remains available.
- [x] Preserve credentials and browser cookies on transient validation failure; deny access until verified. Persist refreshed-token cleanup when expiry races validation.
- [x] Add private, additive migration 006, manual application only; test roles, fencing, restart behavior and compatibility after 001–005 in disposable PostgreSQL.
- [x] Add API rate budgets, safe readiness endpoint, public HTTPS/demo checks, response headers and a single-instance Render configuration.
- [x] Document Render/Railway tradeoffs, production variables, manual deployment, Twitch callback registration, HTTPS/OBS rehearsal, EventSub recovery and rollback.
- [x] Final lint, TypeScript, all 174 automated tests, production build and Git diff checks pass. Production dependency audit: no known vulnerabilities at review time.
- [ ] Manually review/apply pending migrations, configure hosting/Twitch redirects, verify HTTPS/OBS, inspect provider access-log redaction and rehearse restart recovery before judging.

No external deployment, live database changes, browser automation, commit or push. Earlier task notes are historical: durable auth supersedes the process-local session limitation in public mode. EventSub connections, pending deliveries and activity remain process-local. Automatic connection restoration, distributed workers, durable intake, retention/scale work, new Mayor animations, expanded-town OBS previews, isometric art, cosmetics, monetization and new event types remain deferred.

## Prompt 010 — OBS integration and two presentation modes

- [x] Reuse saved worlds, the existing PixiJS renderer and configured cat Mayor; preserve Overview controls and demo isolation.
- [x] Smooth neighborhood camera follows the Mayor within expanded bounds, with a timed event-focus hook.
- [x] Mayor Spotlight uses the same appearance/personality, left/right composition, scale and transparent Mayor-only option.
- [x] Dashboard OBS settings, private preview/copy URL, regenerate and revoke controls.
- [x] Migration 005 stores display preferences and hashed read-only grants separately; no canonical world writes or new secrets/scopes.
- [x] Owner/CSRF management and tenant-bound read access; every poll checks revocation, even with unchanged world revisions.
- [x] Clean responsive OBS page polls saved geometry, existing chat activity and verified subscriber presentations. No fabricated live activity.
- [x] Bounded reaction priority, higher-priority interruption, dedupe, expiry and return-to-idle. Future raid/Bits/donation types have no new live adapters.
- [x] Tests cover RPC permissions/persistence, rotation/revocation, tenant isolation, expansion, camera/composition, live-chat projection and outage recovery.
- [x] Final validation: lint, TypeScript, all 155 tests, production build and Git whitespace checks pass. The final test run used the approved unsandboxed test command after the sandbox's Node user-info lookup failed before test startup.
- [ ] Manually review/apply migration 005 after 001–004; no live database was accessed.
- [ ] Manually verify Chrome and OBS at 1920×1080 and 1280×720 using README. Browser automation is deliberately excluded.

Limitations: one continuously running backend process for live Twitch activity; restarting requires reconnecting Twitch, but saved display access survives. Mayor runtime movement is local presentation state, so separate views need not show identical walking positions. Reaction presentations are brief and not replayed from history. Display preferences are independently saved with last successful write winning across dashboard tabs.

## Prompt 009 — Streamer onboarding, Mayor selection and dashboard

- [x] Inspect installed Next.js guides, auth/ownership, persistent creation, Mayor model, renderer and existing controls.
- [x] Server-protected owner routing: first-time wizard, existing-town bypass and no automatic town creation.
- [x] Four-step onboarding with sample environment, Mayor cards, personality choices, review, validation and explicit creation.
- [x] Cream, orange tabby, gray and dark procedural Mayor presets shared across portraits and the actual Overview renderer.
- [x] Deterministic personality-biased strolls and idle pauses; event tasks retain priority and movement speed remains unchanged.
- [x] Owner dashboard with saved-town preview, counts, connection/sync panels, links and settings.
- [x] Authenticated/CSRF-protected town/Mayor updates, revision conflict handling and preserved geometry, houses, customizations and event receipts.
- [x] Compatibility for Willowbrook/Mochito, legacy appearance and numeric/missing personality settings; no migration or new scope needed.
- [x] 145 automated tests pass, including actual PostgreSQL persistence, basic-scope onboarding, duplicate creation, preset rendering, legacy preservation and conflicting/forged updates.
- [x] Final lint, TypeScript, production build and whitespace verification pass.
- [x] Update manual onboarding/dashboard instructions, architecture and limitations.
- [ ] User manually checks Chrome wizard, responsive layouts, selected Mayor visuals, existing saved town, portal and connections.

Remaining limitations from Prompt 009: wizard drafts are local; no naps/inspection animations; process-local Twitch sessions; dashboard preview is not the full live celebration view. Prompt 010 adds the separate OBS view. No live database modification, automated browser testing, commit or push.

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
3. Profile incremental districts and large OBS scenes manually; expansion and waitlist retries are implemented.
4. Add shared auth storage, validation workers, durable event retention and production rollout controls; transactional town storage and migrations are implemented in Prompt 005.
5. Add durable event intake/retention and production quotas. Keep Twitch gift aggregate counts separate from verified recipient ownership; no exact batch correlation is available.
6. Add public town browsing; verified subscriber exterior customization is implemented.

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

Real follower/raid/Bits/Channel Points events, donation providers, Fastify, Socket.IO, cosmetic inventory/uploads, detailed isometric renderer, production art/audio and complex Mayor AI. Prompts 007/008/010 implement exterior customization, incremental districts and OBS presentation. Demo activity and auth sessions remain in memory. No automatic commits or pushes.

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

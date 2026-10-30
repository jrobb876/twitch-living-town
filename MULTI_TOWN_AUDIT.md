# Prompt 014 — Unified identity and cross-town ownership audit

Reviewed 2026-10-30 against the workspace implementation and migrations 001–006. This is a source review and local regression exercise, not verification of the live project's deployed schema or settings. No live database, browser, deployment or migration application was used.

## Assessment: Partially Supported

The core identity, relationships and authorization are **Supported**. One Twitch account can own its town and independently own subscriber houses in other towns. Separate streamer/subscriber accounts are neither required nor modeled. No identity-schema redesign or migration is required for that requirement.

The complete experience is **Partially Supported**: cross-town property discovery and editing exist, but streamer attribution, visiting another town from My Houses, current-channel lookup and Extension authentication/interaction transport remain unfinished. No essential production-code correction was identified in the reviewed authorization paths. This audit adds regression tests and documentation only.

## Database relationships and migration findings

| Migration | Relevant behavior | Assessment |
| --- | --- | --- |
| 001, persistent towns | `living_town_users.twitch_user_id` is the global primary key. Town owner is a unique foreign key to that identity. Houses use `(town_id,id)` and unique `(town_id,plot_id)` / `(town_id,owner_twitch_user_id)`. Residents use `(town_id,twitch_user_id)`; receipts use `(town_id,event_id)`. | One owned town per user; one owned house per town; houses in many towns are allowed. Identical local house IDs in different towns are valid. |
| 002, subscriber housing | Adds town-scoped reconciliation summaries and active/inactive/unknown subscriber evidence. Retains existing ownership/layout constraints and updates projections within commit. | Subscription state is contextual, not a global account role. Expiry can be recorded without removing the owner. |
| 003, house portal | `living_town_owned_towns(p_user)` finds every town with a house owned by that Twitch ID using the nonunique house-owner index from 001. | No global uniqueness constraint suppresses cross-town properties. Only `service_role` can execute the lookup. |
| 004, expansion | Replaces commit, retaining its execution grant; locks the target town, checks owner/revision, preserves property identity and validates append-only growth. | Allocation, projection and event receipt are atomic; conflicts retry in the trusted event service. |
| 005, OBS | Adds town-keyed display preferences and hashed read capabilities; management checks town owner. | OBS capability grants visual reads, not house editing or town administration. No account-role conflict. |
| 006, durable authentication | Adds a restricted singleton runtime with encrypted session/revocation snapshots and process fencing. | Does not change user, town or property relationships. It supports one active Node auth writer, not horizontally scaled independent EBS writers. |

All six migrations enable RLS on their tables and revoke browser-role access. Trusted RPC entry points have explicit `service_role` execution grants; projection/envelope/growth helpers and direct tables are restricted. Definer functions fix `search_path` and qualify table references. Local tests apply 001–006 to disposable PGlite and exercise role denial; this does not establish what has been applied in production.

`living_town_project` creates user rows from verified residents before inserting their houses. Owners need never have logged in. Later OAuth identifies them using the same Twitch ID and the portal finds those rows. A login alone need not create a user projection row and never establishes subscription entitlement. Display names and login names are metadata, not ownership keys. User metadata can become stale: projection inserts use `ON CONFLICT DO NOTHING`, and OAuth login does not centrally refresh every projected user record. A future attribution change should account for renames without changing keys.

## API authorization and IDOR review

The relevant implementations are `src/lib/persistence/{http,service,repository,streamer-access}.ts`, `src/lib/houses/{http,customization,verification}.ts`, `src/lib/subscribers/{http,service,twitch,mapping}.ts`, `src/lib/chat/{eventsub,manager}.ts` and `src/lib/overlay/{http,service}.ts`.

| Operation | Existing boundary |
| --- | --- |
| Create / administer My Town | HTTP derives the profile from validated Twitch authentication. Server generates initial world/owner; strict input schemas exclude arbitrary snapshots. `owned()` compares that profile ID with the requested town's broadcaster ID. SQL checks the trusted owner argument again. |
| List My Houses | Identity comes from the session, not a query/body username. Private indexed lookup discovers towns, then the service rechecks house ownership in each loaded world. |
| Read / edit a house | Both town ID and house ID are required. `propertyView()` matches the house AND authenticated owner within that town. Save checks active recorded membership, restricted exterior fields, fresh broadcaster-specific Helix membership and the town revision. |
| Subscriber sync / EventSub | Browser controls only request permitted actions. Server derives broadcaster/town from the authenticated scoped grant. Helix rows must match the requested broadcaster (and user for individual checks). EventSub checks the registered subscription, type/version, enabled status, WebSocket session/transport and matching channel before conversion. Queues and reconciliation are broadcaster-scoped; persistent receipts are town-scoped. |
| Public town / OBS reads | Public town projection omits residents, owner IDs, contributions and private customization. OBS management is owner-only; its town-bound read capability cannot mutate a town. |

Cookie-authenticated mutations retain Origin/CSRF checks, forced session validation and strict body parsing. Forged usernames, IDs or extra protected fields do not substitute for ownership. Subscriber ownership grants no Mayor, town-settings or OBS-management permission. Being another town's streamer grants none either. Changing town/house identifiers cannot mutate another person's property through the reviewed routes; tests cover rejection before membership verification or persistence.

**Trusted server boundary:** these are private server RPCs, not per-user Supabase Auth APIs. `p_owner` and `p_user` are assertions supplied by trusted application code; SQL does not verify a Twitch session or live subscription. `saveOwnExterior` intentionally commits using the town's broadcaster after checking the viewer. Likewise, `source: "twitch_verified"` is an internal tag, not cryptographic proof. A holder of the service key can call privileged RPCs for any user. Do not expose the key, generic RPC forwarding, `repository.commit`, `updateHouse` or `applyVerifiedEvent` to website/Extension input. A new transport must use the existing checked business operations. No currently exposed cross-town IDOR was found in this review; this is not a penetration-test guarantee.

## Existing experience and gaps

| Capability | Status |
| --- | --- |
| My Town: own-town management, Mayor name/preset/personality, OBS settings | Implemented in dashboard/onboarding and streamer workspace. Authentication has no mutually exclusive streamer/subscriber role. |
| No town | My Town goes to deliberate onboarding; reading a page does not create a town. |
| My Houses across participating towns | Implemented, including retained legacy houses; links contain both town and house IDs. |
| No houses / signed out / storage failure | Portal provides empty, sign-in and failure states. A user with neither town nor houses can use either entry point. |
| Town and streamer on every property card | Town name exists. `ownerName` is the signed-in house owner's display name, **not the broadcaster**. Broadcaster attribution is missing from `PropertyView` and the cards. |
| Visit the house's town | Missing. The existing Town Overview link goes to `/` (own town/demo), not the selected foreign town. `GET /api/towns/[townId]` provides a visual projection, but no public town page or channel-to-town browsing endpoint exists. |
| Single combined account landing page / current-channel Extension view | Missing. Existing My Town and My Houses destinations provide reusable pieces, not a completed unified dashboard. |

Property discovery currently loads full worlds serially after fetching IDs. This is correct for the present scale but becomes costly for many properties/large worlds. Before broader rollout, consider a bounded/paginated server projection returning only property and broadcaster summaries. Existing indexes and relationships suffice; an additional private RPC may merit an additive migration for efficiency, not identity correctness. Keep public browsing projections separate from private account data.

## Subscription lifecycle: current policy, unchanged

| Situation | Ownership / editing behavior |
| --- | --- |
| Verified new subscriber | Reconciles the user in that broadcaster's town and allocates a house if capacity permits; expansion or waitlist handling applies. Editing requires recorded active evidence plus a successful fresh check at save time. |
| Renewal / repeat event / repeat import | Reuses the resident and existing house. Does not allocate a second property. Resubscription messages receive a membership recheck. |
| Gift received | Verified recipient evidence follows normal subscriber allocation. Aggregate gift events do not invent recipients; reconciliation discovers recipients. |
| Verified expiry | Retains owner, house identity, location and saved customization as legacy/read-only. Failed or partial sync does not imply expiry. A completed scan rechecks an absent user before marking inactive. |
| Subscription restored | Reactivates the retained house, preserving customization and identity, rather than allocating a replacement. |
| Multiple broadcasters | Evidence, reconciliation, allocation and expiry are independent for each town. Expiry in A does not remove editing eligibility in B. |

Retained ownership and current editing privileges are different. Basic OAuth, an Extension role or a displayed subscription badge is not subscription proof. Membership may be stale between synchronization/events; saving verifies it freshly and fails closed on errors. Town revision checks reject a concurrent expiry/save conflict.

**Operational limitation:** `AuthService.subscriptionCredentialsFor(broadcasterId)` requires an unexpired stored session with `channel:read:subscriptions` for that exact broadcaster. Sessions have an eight-hour absolute lifetime. Durable auth survives restarts, but does not remove this expiry or automatically reconnect EventSub. A signed-in viewer can therefore own an eligible house yet be unable to save if the broadcaster's grant is unavailable, expired or revoked. Preserve the current fail-closed policy. A separate prompt should decide whether broadcaster integrations need a dedicated durable grant lifecycle independent of interactive sessions; that would be a new design/migration, not an audit fix.

## Future Extension: reusable services and proposed adapter

The following is a proposed implementation boundary, not implemented behavior or a new entitlement policy.

Reuse `TownPersistenceService` for checked onboarding/settings, own-property reads and `saveOwnExterior`; reuse exterior schemas, membership verification, public visual projections and OBS presentation services. Keep subscriber ingestion server-owned. The cookie HTTP handlers themselves are not an Extension authentication adapter.

Twitch supplies an Extension JWT through `onAuthorized`; the EBS should verify it with the Extension's shared secret and enforce expiry. The console secret is Base64-encoded and remains server-side, separate from OAuth client secrets and `SESSION_SECRET`. Use a maintained JWT library with an explicit permitted algorithm and planned key rotation. [Twitch EBS verification](https://dev.twitch.tv/docs/extensions/building/#verifying-the-jwt), [Twitch shared-secret guidance](https://dev.twitch.tv/docs/extensions/required-technical-background/#json-web-tokens-jwts).

Map only a verified, identity-sharing `user_id` to the existing numeric Twitch identity. Helper `userId` is opaque; frontend viewer fields are unvalidated. Identity sharing is optional/revocable, so missing or unlinked identity must disable private account/property operations. Verify channel and role claims; never accept client query parameters as proof. [Twitch Extension JWT and viewer reference](https://dev.twitch.tv/docs/extensions/reference/#jwt-schema).

Proposed backend adapter responsibilities:

1. Validate JWT signature, allowed algorithm, expiry and claim types using the configured Extension key; reject external/server-token roles at viewer endpoints. Do not log tokens or accept a caller-selected verification key.
2. Produce a minimal trusted actor with numeric Twitch ID plus verified channel context. Resolve display metadata server-side where existing profile contracts need it. No second account, username matching or opaque-ID merging.
3. For channel administration, require broadcaster role, matching actor/channel and stored town owner. Moderator/viewer roles grant no administration. For My Houses, list the actor's properties globally, then enforce the selected town/house ownership and fresh membership on every save. The channel hosting the Extension must not become an implicit grant to other properties.
4. Keep website cookie/CSRF protections unchanged. Add separate JWT-authenticated endpoints with explicit input schemas, response privacy, allowed Extension origins, rate limits and no dependency on third-party session cookies. CORS is not authentication. JWT identity alone does not supply the broadcaster's Helix OAuth scopes.
5. Add a narrow, bounded, rate-limited, deduplicated viewer-interaction API for transient OBS animations, scoped to the verified channel. Never let viewer input become a durable subscriber event, arbitrary world update or an OBS access-token request.

A separately deployed EBS must not instantiate another competing auth-runtime claimant. Initially place the adapter behind the existing single authoritative Node backend, or separately design a shared grant/worker architecture. Existing one-process live activity and manual post-restart reconnection limits remain.

## Regression evidence and implementation sequence

`src/lib/persistence/persistence.test.ts` now adds two integrated regressions using actual local SQL constraints and synthetic OAuth/Helix:

| Requested scenario | Evidence |
| --- | --- |
| User owns a town and houses elsewhere | New first-login/own-town/foreign-property test exercises one session across all roles. |
| Houses in multiple towns | Same test edits equal local house IDs independently and verifies the correct broadcaster/user pair for each save. |
| Two users in one town | Same test creates a neighboring owner; existing simultaneous-allocation test also checks unique houses. |
| Subscriber modifies another house | HTTP GET/PATCH reject the neighbor's property before membership verification, with no write. |
| Streamer administers another town | Foreign Mayor save is forbidden; existing town/OBS HTTP and service tests cover additional admin actions. |
| Houses before first login | SQL projection exists before synthetic OAuth; authenticated discovery returns both properties without recreation. |
| Reconciliation duplicates / cross-town independence | New dual-broadcaster sync test repeats duplicate pages/imports, expires membership in only one town, then restores the same property. |

Recommended separate implementation prompts, in order:

1. Add broadcaster attribution to private property summaries and a correct public town visit page/link, preserving existing authorization. Handle renamed streamers and no-town/no-house states.
2. Compose the unified account landing page from existing My Town/My Houses flows. Add pagination/summary projection only if scale warrants it.
3. Decide broadcaster-grant lifetime and restart/reconnect requirements before promising continuous Extension editing or events. Review any additive migration separately.
4. Implement and test the Extension JWT adapter, identity-sharing states and channel lookup. Cover wrong signature/key/algorithm, expiry, unlink, wrong role/channel, opaque IDs and cross-town IDOR. No generic persistence endpoint.
5. Build Extension views against those checked operations, then add the limited transient OBS-interaction channel and its abuse/replay tests.

**Migration decision:** none required for unified identity, contextual roles or multi-town house ownership. No SQL changed or live migration executed for this audit. Future summary RPCs or durable integration grants should receive their own migration/security review.

Validation completed: `npm run lint`, `npm run typecheck`, `npm test` (192 passed, zero failures/skips), `npm run build` and Git whitespace/diff checks passed. Local SQL tests use disposable PGlite with synthetic identities and mocked Twitch services; they do not contact production Supabase. Browser/Extension integration remains a future manual validation step. This prompt changes this report, README, TASKS and the persistence tests; pre-existing Prompt 012 work is preserved.

# Twitch Living Town — Project specification

## Concept and current milestone

A persistent, procedurally generated cozy town representing a Twitch streamer's community. Followers become residents; subscribers receive customizable houses. Chat animates the community, while subscriptions, gifts, raids and eventually Bits trigger town activities. Each streamer will choose and name a cat-like **Mayor**, headquartered at Town Hall.

The current visual style remains the **Town Overview**. The deterministic generator, 12 original homes, plaza, Town Hall, landscaping, camera controls and regeneration are preserved. A detailed isometric Living Town renderer is deferred. Town artwork remains programmatic; the account UI can show the authenticated Twitch profile picture.

The simulation milestone added renderer-independent ownership, activity, events and a development simulator. Secure Twitch identity connects streamers/viewers; optional real chat activity uses EventSub WebSockets. Prompt 005 adds deliberate per-streamer town creation and durable worlds in Supabase PostgreSQL. Prompt 006 adds verified subscriber synchronization, permanent housing and four live subscription event types. The app uses Next.js App Router, React, TypeScript, Tailwind, ESLint and PixiJS v8.

Chat delivery diagnostics distinguish socket connection, confirmed subscription readiness and accepted internal events. Message IDs are opaque strings used unchanged for deduplication; broadcaster messages follow the same rules as other chat. A bounded, temporary queue handles notifications received before the subscription HTTP response. Development-only structured logs expose safe rejection reasons without chat content or credentials. The source selector alone does not indicate subscription readiness. See README for manual verification.

## Architecture

```text
Verified Twitch adapters / isolated development simulator
                         ↓ normalized TownEvent
processEvent(session, event, receivedAt) → next session + outcome
tickTown(session, now)                  → transient simulation updates
                         ↓
React in-memory session → TownCanvas.update(session)
                         ↓
overviewOf(TownWorld) → original overview graphics + actors/effects

InMemoryTownRepository → isolated demo/test state
PersistentTownRepository → Supabase RPC → PostgreSQL transaction
                         → canonical TownWorld + relational constraint projections
```

`src/lib/simulation/` imports no React, PixiJS or browser globals. Time and event IDs come from the caller. Generation and behavior choices are deterministic. Tests exercise domain behavior without WebGL.

**TownWorld** is the JSON-safe durable snapshot: schema/generator version, stable town ID, streamer Twitch ID, seed, layout, districts, plots, buildings, residents, Mayor identity, processed-event outcomes and correlated gift groups. Entity IDs are scoped by town; database keys must include `town_id`.

**TownRuntime** is transient: clock, 60-second chat samples/score, resident actors, Mayor position/behavior/task queue, and expiring effects. Loading a saved world recreates ambient actors without replaying celebrations. Normalized chat text is held only in transient memory for duplicate detection.

Coordinates are fixed **world units**, independent of viewport pixels and camera zoom. The overview maps these to its original drawing coordinates; another renderer can project them differently. House appearance stores colors, an architecture identifier and semantic decoration IDs, with no PixiJS objects or texture/sprite coordinates.

## Event contract

All events have `id`, `townId`, `occurredAt` and a discriminated `type`. Foreign-town events are rejected. Repeated event IDs return a duplicate outcome without changing state or replaying effects. Source adapters must supply stable delivery IDs and consistent gift-group correlation IDs; random IDs are only for new demo events.

| Event | Durable change | Transient response |
| --- | --- | --- |
| CHAT_MESSAGE | Delivery outcome only | Rolling activity; no automatic follower record |
| NEW_FOLLOWER | Create/update follower resident | Arrival and resident actor; no house |
| NEW_SUBSCRIBER | One resident and at most one owned house | Housewarming and Mayor visit |
| RESUBSCRIPTION | Preserve ownership/customization; max cumulative months | Welcome-back; reconcile missing initial subscription if needed |
| GIFT_SUBSCRIPTION | Reconcile group and identified recipients | One gifter celebration per group; housewarmings for newly housed users |
| INCOMING_RAID | Delivery outcome only | 20-second Town Hall welcome; no permanent residents/houses |

### Housing

Subscriptions fill the two vacant expansion plots first. After that, the original unclaimed showcase homes can receive owners without moving or restyling them. There are 14 allocatable homes. Further subscribers enter an explicit housing waitlist; incremental growth and waitlist fulfillment are future work. House/resident uniqueness is scoped to `(townId, twitchUserId)`.

### Gift reconciliation

Each gift group retains its gifter, maximum announced total and unique recipient Twitch IDs. Its contribution to gift totals is `max(announcedTotal, uniqueRecipients)`, never their sum. Aggregates without recipient identities create no imaginary houses. Individual gifted NEW_SUBSCRIBER events carry the same `gift.groupId` and gifter as the aggregate. Either delivery order works; duplicate recipients do not repeat housewarmings. Separate groups may legitimately gift to the same resident while retaining a single house.

The simulator supplies explicit gift correlation keys. Twitch's live events do not expose a shared batch/recipient key: aggregate delivery IDs deduplicate batch totals/celebrations, while verified API records and recipient events independently reconcile housing by Twitch user ID. The adapter never guesses matching batches from timing, display names or gifter alone.

### Chat and behavior

One credited message per user per 10 seconds; identical normalized messages from the same user are ignored within the 60-second window. Each accepted message starts at 10 points and fades linearly to zero, capped at 100 total. Levels: peaceful (<15), stirring (15–49), lively (50+). Decay requires no new events. Received time is the trusted activity clock; source timestamps are metadata.

Higher activity increases travel speed and shortens idle pauses. Mayor tasks route through the graph, approach houses and celebrate on arrival. Raid welcomes expire if the Mayor cannot arrive in time. Reduced-motion preference suppresses cosmetic movement while logical simulation/counters continue. Up to 24 resident actors, 32 concurrent effects and 16 Mayor tasks are runtime limits; resident records are not capped.

## Simulator and production boundary

The collapsible simulator generates sample `sim-*` identities and supports all six event types, chat bursts, repeated-message checks, gift-recipient replay, exact event-ID retry and reset. Reset keeps the seed and clears the session. Regeneration changes the seed and clears the session.

The server enables the simulator only in development or with `TOWN_DEMO_MODE=true` explicitly supplied **at build time** for an authorized demo. Production defaults to disabled. There is no browser event-writing API; the live chat service separately holds in-memory activity. This demo opt-in is not authentication; future durable mutations require server authorization.

## Twitch identity and authorization

The registered application is **Living Town**. Server-only configuration consists of `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI` and a random 32-byte `SESSION_SECRET` encoded as base64 or hex. Basic login requests no extra Twitch scopes; Get Users supplies ID, login, display name and profile picture, excluding email and role/subscription claims. Chat authorization separately requests `user:read:chat` as described below.

```text
Connect button → GET /api/auth/twitch/login → Twitch consent
              → GET /api/auth/twitch/callback → /account
                   server exchange → validate → Get Users → opaque session cookie
Account widget → GET /api/auth/session → public profile + logout CSRF only
Sign out       → POST /api/auth/logout → local invalidation + Twitch revocation
Future mutation → requireTownOwner(session, townId, trusted repository)
```

State is 256-bit random, browser-bound using a separate HttpOnly cookie, stored by HMAC digest, consumed atomically before any exchange and expires in ten minutes. Missing, mismatched, reused and expired state, duplicate parameters and denied authorizations are rejected. Callback failures never echo upstream descriptions, credentials or codes.

Sessions use opaque 256-bit IDs, eight-hour absolute expiry, host-only HttpOnly/SameSite=Lax cookies, and Secure `__Host-` cookies in production. Server-memory records store HMAC session keys and AES-256-GCM encrypted OAuth tokens with record-specific associated data. The server-only composition root owns environment access, the Twitch client, memory store and validation timer. Core services accept injected clocks/storage/clients for testing without real credentials.

Login validates Twitch client ID and stable numeric user ID against Get Users. Startup re-entry validates retained sessions; a process restart has no retained sessions. A minute timer checks sessions whose validation is at least 30 minutes old, even without browser traffic. Stale reads also validate, and owner guards force validation. Refresh is reactive after known token expiry and an invalid-token response; unexpected revocation or failed validation removes affected sessions. Concurrent reads share the same session validation operation. Sign-out requires same-origin form POST and session-bound CSRF, removes sessions locally first, then revokes access tokens; failed revocations retry for at most an hour in memory.

The public demo stays accessible signed out. Login does not replace simulated residents, automatically assign a town, or prove an active subscription. Ownership is checked against `TownWorld.streamerTwitchUserId` loaded from the database. Deliberate town creation and Mayor updates require session validation and mutation CSRF. No viewer gains administration through display name, profile type or client-supplied ownership.

Authentication still supports one continuously running Node process, capped at 200 sessions/1,000 pending logins. Restart loses auth and revocation records but preserves database worlds. Shared auth storage, distributed refresh coordination and scheduled validation remain prerequisites for multi-process/serverless deployment. Production authentication requires HTTPS and deployment log redaction for OAuth callbacks.

## Real chat integration (Prompt 004)

An explicit, CSRF-protected **Authorize Twitch Chat** action requests only `user:read:chat` through the existing OAuth flow. The state record binds the requested upgrade to the current Twitch ID; callback validates the granted scope and same account. Existing sessions never implicitly gain permission. Granted scopes are retained server-side and updated after validation/refresh.

The process-wide ChatManager owns at most one EventSub connection per broadcaster, shared by tabs and retained across Next module reloads. POST `/api/chat/start`, `/stop` and `/authorize` require authentication, same origin and session CSRF. GET `/api/chat/status` requires authentication and returns only the requester's channel. Both subscription condition IDs come from the validated session. Connecting a personal preview grants no authority over existing towns and proves no subscription entitlement.

```text
Twitch EventSub WebSocket → channel.chat.message validation → CHAT_MESSAGE
  → processEvent (existing domain) → server activity window
  → authenticated one-second polling → projectLiveActivity → existing tickTown/PixiJS
Development simulator → separate demo TownSession → same domain/renderer
```

The server uses Node's native WebSocket and subscribes with a user token only after welcome. Watchdogs handle missing welcomes/keepalives, backoff recreates lost sessions/subscriptions, and Twitch reconnect URLs transfer an existing subscription without resubscribing. The old socket stays until the replacement welcome. No application messages are sent to EventSub. Revocation, logout and session expiry stop the connection; periodic token validation remains independent of browser traffic.

Channel identity maps to `twitch:<broadcaster ID>`; event identity uses the Twitch chat message ID, not delivery ID or display name. Payload/channel/session/subscription checks reject malformed and foreign events. Live duplicate IDs expire after ten minutes with a 10,000-entry cap, while the live outcome ledger is capped at 1,000. Incoming messages beyond dedup capacity are dropped until space expires. Existing spam rules remain one credited message/user/10 seconds, repeated-text suppression and 60-second decay. Normalized text is HMAC-fingerprinted before processing; only transient fingerprints/chatter IDs are retained for spam control. No readable chat history is stored or sent to the browser. Activity samples cap at 2,000.

Live and simulated views use separate TownSession values and share the existing renderer implementation. Four transient ambient actors reuse existing graphics/behavior without creating resident records. Live summaries update activity only, preserving layout and camera during chat. Switching town source remounts the canvas; regeneration stays local. A label identifies LIVE SOURCE versus SIMULATED even during reconnection, alongside the actual EventSub connection status and last-event time.

No extra worker is needed for the supported single, continuously running Node process. The service boundary isolates the EventSub lifecycle for a later worker/shared-store deployment. At most 100 channel entries are held; inactive entries expire after ten minutes without status reads. Process restart clears sessions/live activity; ordinary network outages can lose events because Twitch does not replay them. Serverless, multiple replicas, public live-activity viewing and distributed delivery remain future work. Durable town ownership is now stored in Supabase.

## Persistence and future product

The UI holds separate live/persistent and demo TownSession values. A persistent view reconstructs runtime from the database's canonical TownWorld; it never regenerates the saved layout. The server's live chat feed uses the same processor for temporary activity and never writes chat content or activity ticks to the database. Reload resets only the local demo and transient runtime; saved towns survive application restarts.

Versioned SQL in `supabase/migrations/202610280001_persistent_towns.sql` creates users, towns, Mayor settings, districts, plots, houses, residents and processed durable events. The world snapshot is canonical and relational projections update atomically through server-only RPCs. One town per owner, composite house identities, unique owner/plot/event constraints and revision locking protect concurrent changes. Verified-event retries rerun the existing processor on the latest snapshot; no second simulation exists. Event/gift retention and large-world scaling remain follow-up work.

Authenticated GET `/api/town` resolves only the signed-in user's town. POST creates one deliberately from bounded names and a server-generated UUID/seed; PATCH saves Mayor settings with a revision guard. Mutations force session validation and require same-origin CSRF protection. The browser cannot supply an owner ID or complete world. Server methods support stable house updates and verified subscription application, with no browser event-ingestion/customization endpoint. Subscription evidence stores active/inactive state, tier, gift status, source and verification time; missing evidence remains unknown.

RLS is enabled on every new table, browser privileges are revoked, and only the server role can execute intended RPC entry points. Twitch sessions remain separate from Supabase Auth. The server secret bypasses RLS, so Next.js authorizes every protected operation. Public GET `/api/towns/[townId]` selects visual data and excludes ownership, residents and contribution details. Configuration/database failures are explicit and never turn a failed production save into an in-memory success. The labeled demo has no persistence path.

World schema/generator versions are pinned at 1. Existing coordinates, seed, house/plot identity and assigned ownership cannot change through normal saves. Unknown versions fail closed and require a reviewed migration. Mayor appearance/personality and house size/prestige/customization are stored as bounded settings. Subscriber Housing reuses existing renderer/effects and adds no economy or customization editor. See `supabase/README.md` for setup and production limits.

Planned surfaces: public town directory, full streamer dashboard, subscriber portal, OBS overlay, live Twitch EventSub/Helix features beyond chat, and later Fastify/Socket.IO services.

Twitch OAuth, Helix identity/subscriber verification, EventSub chat/subscriptions and Supabase town persistence are implemented. Real follower/raid/Bits/Channel Points events, Socket.IO, OBS, customization editor, arbitrary expansion and an isometric renderer remain deferred. Customization currently means stored, asset-independent settings. Richer Mayor naps, inspections and personality behavior remain future work.

## Verified Subscriber Housing (Prompt 006)

An explicit same-account OAuth upgrade requests `channel:read:subscriptions`, retaining already granted chat scope. Both upgrade directions validate all requested scopes before replacing the session. Sync/connect controls derive broadcaster and town ownership from the validated session, never from browser claims. Basic login and chat grant no subscriber entitlement.

`src/lib/subscribers` contains a bounded Helix pagination adapter, notification mapper and orchestration service. GET `/api/subscribers` exposes only the current account's housing counts, last sync and connection status. Its CSRF-protected POST supports authorize/sync/connect/disconnect. GET `/api/subscribers/house?townId=<UUID>` selects only the signed-in user's house in that town; legacy ownership is not proof of active entitlement. There is no customization mutation endpoint.

Sync applies each verified user through the existing processor and SQL commit, preserving customization and stable plots. A single running job per broadcaster tracks imported/updated/unchanged/waitlisted/failed records and pages. Partial failures retain progress; failed pages never cause membership deletion. After a complete walk, missing active users require an additional empty user-filtered API response before becoming inactive. Twitch pagination is not an atomic snapshot. Older timestamped evidence cannot overwrite newer membership state. Migration 002 adds optional evidence/sync fields to schema v1 and updates the private relational projections, retaining all original transaction constraints.

The existing EventSub connection registers version-1 `channel.subscribe`, `channel.subscription.end`, `channel.subscription.gift`, and `channel.subscription.message` with broadcaster-only conditions. Chat and housing share one socket. Readiness requires all requested Create Subscription responses to match enabled status, identity, type, version, transport and session; handoff transfers registrations without recreating them. Independent controls restart the socket when the requested set changes. Stable Twitch delivery IDs are deduplicated by SQL before committing effects/projections.

Subscription end preserves the house as legacy; renewal reactivates the same property. Resub messages require a current API record and retain maximum known cumulative months. Aggregate gifts store one batch/celebration and schedule an API sync; individual recipients receive homes, never the gifter by attribution. Anonymous gifters are represented by null. Recipient events and sync do not increment gift totals. Exact batch-recipient correlation is unavailable and is not fabricated.

Live failures retry in a bounded per-broadcaster memory queue (1,000 pending, eight attempts). Sync, queues, sessions and sockets require one continuously running Node process; interruption may lose notifications. A later sync repairs current membership but cannot recreate missed historical gifts. UI polls housing every five seconds and reloads the saved world on revision changes, preserving camera/world identity. Existing temporary effects and Mayor tasks are briefly projected to the owner UI; they are not persisted.

There are 14 fixed property slots. Extra subscribers remain recorded on a waitlist, including after another member's house becomes legacy. New district generation/relocation is not performed. Incremental expansion, durable queues/worker leases, retention, a subscriber editor with fresh entitlement checks and public live viewing remain future work.

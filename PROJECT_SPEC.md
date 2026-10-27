# Twitch Living Town — Project specification

## Concept and current milestone

A persistent, procedurally generated cozy town representing a Twitch streamer's community. Followers become residents; subscribers receive customizable houses. Chat animates the community, while subscriptions, gifts, raids and eventually Bits trigger town activities. Each streamer will choose and name a cat-like **Mayor**, headquartered at Town Hall.

The current visual style remains the **Town Overview**. The deterministic generator, 12 original homes, plaza, Town Hall, landscaping, camera controls and regeneration are preserved. A detailed isometric Living Town renderer is deferred. All visuals remain programmatic.

This milestone adds renderer-independent simulation, ownership, activity, events and a development simulator. The app uses Next.js App Router, React, TypeScript, Tailwind, ESLint and PixiJS v8.

## Architecture

```text
Future Twitch adapter (not implemented) / development simulator
                         ↓ normalized TownEvent
processEvent(session, event, receivedAt) → next session + outcome
tickTown(session, now)                  → transient simulation updates
                         ↓
React in-memory session → TownCanvas.update(session)
                         ↓
overviewOf(TownWorld) → original overview graphics + actors/effects

TownRepository interface → InMemoryTownRepository (reference implementation)
                         → PostgreSQL/Supabase implementation later
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

Cross-message gift counting requires a trustworthy correlation key from a future adapter. The domain does not guess matching batches from timing, display names or gifter alone.

### Chat and behavior

One credited message per user per 10 seconds; identical normalized messages from the same user are ignored within the 60-second window. Each accepted message starts at 10 points and fades linearly to zero, capped at 100 total. Levels: peaceful (<15), stirring (15–49), lively (50+). Decay requires no new events. Received time is the trusted activity clock; source timestamps are metadata.

Higher activity increases travel speed and shortens idle pauses. Mayor tasks route through the graph, approach houses and celebrate on arrival. Raid welcomes expire if the Mayor cannot arrive in time. Reduced-motion preference suppresses cosmetic movement while logical simulation/counters continue. Up to 24 resident actors, 32 concurrent effects and 16 Mayor tasks are runtime limits; resident records are not capped.

## Simulator and production boundary

The collapsible simulator generates sample `sim-*` identities and supports all six event types, chat bursts, repeated-message checks, gift-recipient replay, exact event-ID retry and reset. Reset keeps the seed and clears the session. Regeneration changes the seed and clears the session.

The server enables the simulator only in development or with `TOWN_DEMO_MODE=true` explicitly supplied **at build time** for an authorized demo. Production defaults to disabled. There is no event-writing API or shared server state. This opt-in is not authentication; future durable mutations require server authorization.

## Persistence and future product

The UI holds one TownSession in React memory. TownRepository and its defensive-copy in-memory implementation demonstrate multi-town load/save; they are not wired to disk, localStorage or a server. Reload clears all changes.

Before persistence: implement transactions and unique constraints for event IDs, owners and gift recipients, schema migrations, event retention and authoritative clocks. The demo retains a complete delivery ledger in memory for retry correctness and is not designed for unlimited ingestion.

Planned surfaces: public town directory, streamer dashboard, subscriber portal, realtime renderer, OBS overlay, Twitch OAuth/Helix/EventSub, and PostgreSQL/Supabase with later Fastify/Socket.IO services.

No authentication, live integration, database, Socket.IO, OBS, customization editor, Bits processing, arbitrary expansion or isometric renderer is implemented. Customization currently means an asset-independent data structure. Richer Mayor naps, inspections and personality remain future work.

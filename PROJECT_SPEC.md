# Twitch Living Town — Project specification

## Product concept

Twitch Living Town is a persistent, procedurally generated, cozy 2D town representing a Twitch streamer's community. Streamers will create their own towns; followers become inhabitants, and subscribers receive houses they can customize on the website. Chat brings the village to life. Subscriptions, gift subscriptions, raids, Bits and other community events will eventually trigger activities and celebrations.

Every town has an adorable animated cat-like **Mayor**, chosen and named by its streamer. The Mayor is the companion and visible personality of the product, with Town Hall as its headquarters. Planned behaviors include wandering, visiting homes, napping, welcoming new inhabitants, inspecting construction and celebrating events.

## Current milestone: foundation and first village

Implemented locally:

- Next.js App Router and React shell, strict TypeScript, Tailwind CSS and ESLint.
- Browser-only PixiJS v8 renderer with asynchronous initialization and complete successful-init teardown, including interrupted React effects.
- A pure deterministic town model from a 32-bit seed, independent of React and PixiJS.
- Central paved plaza with a fountain, Town Hall, connected streets and house paths.
- Twelve varied homes in six residential blocks, gardens, fences, mailboxes, trees, flower patches, lamps, benches and two reserved expansion areas.
- Procedural vector cat Mayor with a scarf, idle bob, walking motion and basic route choices; no complex AI.
- Pointer/touch drag, cursor-centered wheel zoom, camera buttons and keyboard controls.
- Town/Mayor names, house count, seed display, regeneration and responsive UI.
- A fixed initial seed, with all regeneration state held only in memory.

Visual direction: cream surfaces, sage greens, warm terracotta and muted teal, rounded silhouettes, roof/wall shading and soft shadows. A slightly elevated top-down view keeps streets, gardens and houses distinct. No external artwork or image generation dependency.

## Components and architecture

```text
App Router page
  └─ TownExperience (names, seed, UI)
       ├─ generateTown(seed) → serializable Town
       └─ TownCanvas (dynamic import; ssr: false)
            └─ createTownRenderer(host, town, name, AbortSignal)
                 ├─ drawTown(town) → terrain + depth-sorted actors
                 ├─ drawMayor() + local animation ticker
                 └─ camera + input handlers + ResizeObserver
```

The model contains world bounds, houses, trees, flowers, roads, expansion plots and a connected navigation graph. Seeded randomness controls appearance and landscaping. The road/block scaffold is fixed in this milestone to guarantee navigable, legible towns; future generators can replace it while preserving the model/rendering boundary.

PixiJS owns no product data. React owns the current seed and disposes the old renderer on regeneration/unmount. An abort signal guards asynchronous setup; cleanup releases canvas, ticker, display objects, renderer, resize observer and input listeners. Browser-only imports keep WebGL and DOM dependencies out of server execution. Resize preserves the relative zoom and camera center.

## Planned product surfaces

1. **Public website:** browse streamer towns, search communities, visit their live villages.
2. **Streamer dashboard:** provision a town, choose/name a Mayor, configure community behaviors and display settings.
3. **Subscriber portal:** verify eligibility and customize an owned home.
4. **Realtime town renderer:** consume durable town snapshots and event updates.
5. **OBS browser-source overlay:** dedicated transparent view with broadcast-friendly sizing and controls.
6. **Twitch integration:** server-side OAuth, Helix synchronization and verified EventSub events, respecting platform scopes, rate limits and delivery semantics.
7. **Persistence:** PostgreSQL/Supabase storage for towns, seeds/generator versions, inhabitants, ownership, customization and event history.

## Future server architecture

Next.js serves public and authenticated web surfaces. A later Fastify service can own Twitch callbacks/event processing and Socket.IO broadcasts. PostgreSQL/Supabase becomes authoritative for multi-tenant town state. Events should be validated, deduplicated and translated into domain actions before fan-out to browsers. Persist both generator version and seed so algorithm changes do not silently rearrange existing towns.

Potential entities (not implemented): Streamer, Town, Mayor, Inhabitant, ResidentialPlot, House, SubscriptionOwnership, HouseCustomization and CommunityEvent. Authorization boundaries must be defined before subscriber customization or streamer settings are implemented. Secrets remain server-side; public clients receive only display state.

## Scope boundaries

This milestone has no accounts, OAuth, Twitch API calls, EventSub listener, database, Socket.IO server, persistent ownership, editing portal, true event simulation or production OBS mode. The Mayor uses a small idle/walk behavior, not planning AI. The village is a local visual prototype, not a live or persistent Twitch service.

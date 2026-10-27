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

## Validation for this milestone

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
4. Design transactional PostgreSQL tables, tenant authorization, event retention and migrations.
5. Define Twitch adapter payload validation and stable gift correlation before live integration.
6. Add customization controls and public multi-town routing once persistence/authentication are ready.

## Deferred

OAuth, Helix, live EventSub/chat, Supabase/PostgreSQL, Fastify, Socket.IO, OBS, subscriber accounts, customization editor, Bits, detailed isometric renderer, production art/audio and complex Mayor AI. All town changes remain in memory. No automatic commits or pushes.

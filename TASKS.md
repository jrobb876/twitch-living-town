# Twitch Living Town — Task tracker

## Completed: foundation and first village

- [x] Initialize Next.js, React, strict TypeScript, Tailwind CSS and ESLint in the existing repository root.
- [x] Install PixiJS v8 and provide browser-only rendering.
- [x] Handle asynchronous initialization, React unmount/regeneration and resource cleanup.
- [x] Separate deterministic town generation and serializable types from graphics.
- [x] Build a central plaza, fountain, Mayor's Town Hall, connected roads and home paths.
- [x] Arrange 12 homes into residential blocks with varied colors and architecture.
- [x] Add grass, trees, gardens, flowers, fences, mailboxes, lamps and benches.
- [x] Reserve two areas for future residential expansion.
- [x] Draw a cat-like Mayor with idle/walk animation and autonomous path wandering.
- [x] Add camera zoom, drag pan, fit, keyboard and on-screen controls.
- [x] Show names, house count, seed and a functioning regeneration button.
- [x] Provide loading/error UI, responsive layout and reduced-motion behavior.
- [x] Add requested documentation, placeholder environment file and ignore rules.
- [x] Add deterministic generation and connected-navigation tests.

## Validation

- [x] Install dependencies.
- [x] TypeScript checks.
- [x] Generator tests (2 tests, covering determinism and graph invariants across 5 seeds).
- [x] Clean lint.
- [x] Final production build after review.
- [x] Local development and production routes return HTTP 200; production HTML contains the town name, Mayor name and regenerate control.
- [ ] Browser smoke check of WebGL rendering, Mayor, regeneration and camera. The available Windows browser-control tool stopped because it could not determine the current browser URL confidently enough to enforce its policy. Visual and interaction checks remain manual; HTTP checks do not validate WebGL.

## Next priorities

1. Review the visual direction and choose the Mayor's eventual art/animation style.
2. Add a seed permalink and generator version before introducing durable town storage.
3. Extend topology generation beyond the fixed block scaffold, with collision-aware placement and incremental expansion.
4. Add focused runtime lifecycle regression coverage and broader mobile/touch/browser testing.
5. Define server-authoritative town, inhabitant and ownership models and authorization boundaries.
6. Plan Twitch scopes, event delivery/deduplication and connection lifecycle before implementing integration.

## Deferred features

- Twitch OAuth, Helix, EventSub, chat ingestion and live community events.
- Supabase/PostgreSQL persistence and tenant isolation.
- Fastify backend, Socket.IO synchronization and event queues.
- Streamer dashboard, subscriber authentication/accounts and house ownership/customization.
- Public town directory, multi-town routing and discovery.
- OBS browser-source route, transparent background mode and broadcast controls.
- Mayor selection, custom naming interface, naps, greetings, construction inspections, celebrations and advanced behaviors.
- Follower inhabitants, subscription/gift subscription/raid/Bits activities.
- Production art, sound, day/night cycles, pathfinding on arbitrary terrain and pinch zoom.

No commit or push is part of this milestone. The current prototype does not save town changes across reloads.

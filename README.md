# Twitch Living Town

A cozy, seeded 2D village for the Codex x TwitchCon Hackathon, with a renderer-independent event simulation and Mochi, its cat-like Mayor. The original visual style remains the Town Overview. Twitch is **not connected** and town changes are **not persisted** yet.

## Run locally

Use Node.js 22 or newer and npm. From PowerShell:

```powershell
cd F:\Development\TwitchLivingTown
npm install
npm run dev
```

Open **http://localhost:3000**. If PowerShell blocks `npm.ps1`, use `npm.cmd` in the same commands. On subsequent checkouts, `npm ci` installs the exact lockfile versions.

No credentials or environment configuration are required. Optionally copy `.env.example` to `.env.local` to change the town and Mayor names, then restart the server. `NEXT_PUBLIC_*` values are public and must never contain secrets.

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

The browser needs WebGL and hardware acceleration. A loading state and retryable error message cover renderer startup failures. All visuals use local procedural graphics or inline SVG, with no art downloads or external font requests.

## Checks and production

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production build at http://localhost:3000. Stop a running server with Ctrl+C before starting another on that port. `typecheck` generates Next.js route types before checking TypeScript. Tests cover generation, placement stability, event/ownership/gift deduplication, chat decay, behavior transitions, snapshot restore, capacity, town isolation and simulator gating.

Final Prompt 002 validation passed: lint, TypeScript, all 18 tests and production build. Generated production HTML confirms the simulator is disabled by default. Browser interactions were not automatically tested after resuming, as requested; manually verify the steps above, Mayor animation, camera pan/zoom and regeneration in Chrome. See TASKS.md for validation details.

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
```

The spatial layout uses a fixed connected block template. Seeds vary appearance and planting. New subscribers never trigger regeneration: two expansion plots and 12 unclaimed starter homes provide 14 ownership slots. Arbitrary district expansion, waitlist fulfillment and a customization editor are deferred. Runtime effects are not part of the saved-world shape. The UI session and example repository are in memory only; there is no disk/database persistence.

## Stack

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, ESLint and PixiJS 8. Exact versions are captured in `package-lock.json`. The application is initialized directly in the repository root.

See [PROJECT_SPEC.md](PROJECT_SPEC.md), [TASKS.md](TASKS.md) and [DECISIONS.md](DECISIONS.md) for the roadmap and architecture. Twitch OAuth, Helix, EventSub, persistence, realtime services, portals and the OBS overlay are deferred.

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [PixiJS application lifecycle](https://pixijs.com/8.x/guides/components/application), [PixiJS graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics), and [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).

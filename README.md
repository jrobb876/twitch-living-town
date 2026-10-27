# Twitch Living Town

A cozy, seeded 2D village for the Codex x TwitchCon Hackathon. This first milestone is a local Next.js application with a PixiJS village and Mochi, its cat-like Mayor. Twitch is **not connected** and town changes are **not persisted** yet.

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
- The Mayor wanders between houses, the plaza and Town Hall, pausing along the way. Reduced-motion preference stops the decorative animation and wandering.

The browser needs WebGL and hardware acceleration. A loading state and retryable error message cover renderer startup failures. All visuals use local procedural graphics or inline SVG, with no art downloads or external font requests.

## Checks and production

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production build at http://localhost:3000. Stop a running server with Ctrl+C before starting another on that port. `typecheck` generates Next.js route types before checking TypeScript. Tests verify deterministic generation, variation, house count, expansion space and connected, bidirectional navigation.

Foundation validation: lint, TypeScript, both generator tests and the production build passed; the local development and production routes returned HTTP 200. Visual browser testing could not be completed because the Windows browser-control tool could not reliably determine the current browser URL. Manually verify the rendered town, Mayor motion, regeneration and camera controls in a WebGL-capable browser. The HTTP check alone does not verify the canvas.

## Structure

```text
src/app/                         App Router page, metadata, global/Tailwind styles
src/components/town-experience.tsx  UI, seed state, Mayor portrait
src/components/town-canvas.tsx      Client-only loading and React lifecycle
src/lib/town/types.ts               Serializable town model
src/lib/town/generate.ts            Pure seeded procedural generation
src/lib/town/generate.test.ts       Determinism and topology tests
src/lib/rendering/draw-town.ts      Programmatic village and Mayor artwork
src/lib/rendering/create-renderer.ts PixiJS lifecycle, animation and camera
```

The spatial layout deliberately uses a fixed connected block template. Seeds vary house styles, colors, small placements, trees and flowers. It is not yet an arbitrary terrain or road-layout generator. The 12 homes are placeholders without residents or ownership, and the two reserved plots represent future expansion.

## Stack

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, ESLint and PixiJS 8. Exact versions are captured in `package-lock.json`. The application is initialized directly in the repository root.

See [PROJECT_SPEC.md](PROJECT_SPEC.md), [TASKS.md](TASKS.md) and [DECISIONS.md](DECISIONS.md) for the roadmap and architecture. Twitch OAuth, Helix, EventSub, persistence, realtime services, portals and the OBS overlay are deferred.

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [PixiJS application lifecycle](https://pixijs.com/8.x/guides/components/application), [PixiJS graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics), and [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).

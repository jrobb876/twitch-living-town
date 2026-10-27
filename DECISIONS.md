# Technical decisions

## 2026-10-27 — Foundation

1. **Next.js App Router, React and strict TypeScript.** Establish the intended full-stack application directly in the existing root. Preserve the repository and origin remote; do not initialize Git, commit or push as part of scaffolding.
2. **npm and a committed-in-future lockfile.** Use npm for the requested setup. `package-lock.json` captures the resolved dependency tree for reproducible `npm ci` installs. Node 22+ is the project baseline.
3. **Tailwind CSS 4 with a global component stylesheet.** Tailwind runs through PostCSS. Named component classes express the cohesive village interface; no UI component library or remote fonts are needed.
4. **PixiJS v8, initialized asynchronously in the browser.** React dynamically loads the canvas component without SSR. The rendering implementation imports at effect time. It uses the v8 graphics API and an owned Application/ticker rather than global shared resources.
5. **Explicit renderer lifecycle.** Each scene owns its canvas, observer, ticker and input listeners. Regeneration remounts the keyed canvas. Cleanup aborts pending setup; an application that finishes initialization after disposal is destroyed immediately. Successfully initialized applications also clean up if scene construction fails.
6. **Serializable model separate from graphics.** `generateTown` imports no renderer/browser code. Mulberry32 supplies deterministic local randomness. Generation and Mayor route choices use independent PRNG streams. Regeneration uses browser crypto only to choose the next seed.
7. **Constrained procedural generation first.** A fixed plaza/road/block scaffold guarantees connected access. Seeded variations affect architecture, colors, tree sizes, planting and small home offsets. Twelve homes and reserved expansion space provide a useful foundation before arbitrary roads, terrain or incremental growth.
8. **Mayor is the companion.** The companion is an in-world cat-like Mayor, with Town Hall as headquarters. This is a product character, not a ChatGPT Work pet. The first placeholder is drawn in code; the static portrait uses inline SVG. Rich art and streamer selection/name settings are future work.
9. **Simple autonomous behavior.** The Mayor chooses graph neighbors, avoids immediately reversing where possible, pauses at destinations and animates with frame-time-independent movement. Plaza routes avoid the fountain. Reduced-motion preference disables decorative motion. Complex AI, naps and event reactions are deferred.
10. **Camera independent of town data.** Uniform scaling and translation provide bounded panning, pointer-centered zoom and fit-to-town, with resize handling, touch buttons and keyboard alternatives. Pinch zoom and selection are future enhancements.
11. **No backend or secrets in the prototype.** There is no mocked authentication, no request for Twitch credentials and no integration client. `.env.example` contains optional public labels only. `.gitignore` excludes local env files, caches, outputs, keys and credentials.
12. **Durability will require a versioned generator.** Persistence is deliberately deferred. Reload returns the starter seed. Before saving real towns, persist generator version plus seed and explicit ownership/customization, and define migrations.

## Validation approach

Use ESLint, Next route generation plus TypeScript, production build and focused Node tests for deterministic generation/navigation. Browser smoke checks validate the real WebGL scene, regeneration and camera. Visual assets remain programmatic; no downloaded stock art or image-generation service is involved.

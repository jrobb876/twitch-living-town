# Twitch Living Town

## Subscriber housewarming highlights (Prompt 020C)

Successful new housing assignments carry the allocator's actual house ID and subscriber display name in ephemeral presentation metadata. Existing cottages and newly built homes receive a soft gold outline, four roof sparkles and a short label for five seconds, with a smooth fade. Ownership, allocation and saved-world data are unchanged. Renewals without a new assignment, imports, subscriber synchronization and refreshed views do not replay highlights.

Highlights share the town's camera transform and never request a camera move. Overview and Follow Mayor show labels at readable zoom (at least 0.45 scale); Mayor Spotlight omits labels and retains subtle outlines/sparkles when its town background is visible. Transparent Spotlight retains the existing Mayor celebration. Reduced motion keeps sparkles static while preserving the fade. At most four recent houses are highlighted concurrently; excess burst effects are dropped rather than queued for sequential playback. The existing bounded presentation buffer, per-view replay cursors and event deduplication remain in place. A house outside the camera remains offscreen; the existing Mayor celebration continues.

Manual verification:

1. Restart the Node server after updating. In an authorized development session, open `/town-overview`, select the simulated source, open **Event simulator**, and **Reset simulation**.
2. Click **New subscriber**. An existing cottage should glow and show the simulated subscriber's name while the Mayor celebrates. Pan and zoom during the five-second effect; it should stay attached to that cottage and fade away.
3. Click **Resubscription** and **Retry last event ID**: neither should highlight another house. Fill existing capacity, then add a subscriber to verify a newly constructed home. Add 48 demo subscribers to confirm at most four simultaneous highlights with no long animation backlog.
4. Enable reduced motion in the OS/browser settings and repeat: sparkles should remain still. Reset simulation should clear all effects.
5. For live testing, leave Overview and valid OBS sources open before a new verified subscriber receives a house. Check at 1920×1080 in Follow Mayor and Spotlight with town background. A visible assigned house should highlight; Spotlight must not show a large caption or jump the camera. Local simulated events do not propagate to a real OBS town.
6. Refresh the views, reconnect, or run subscriber sync: old assignments should not replay. Manual visual/OBS verification is required; automated tests use synthetic events and local database fixtures only.

## Connect My Twitch Community (Prompt 020)

Open **My Town → Community** (`/dashboard/town#community`) and choose the optional **Followers**, **Subscribers** and **Twitch chat** features, then click **Connect My Twitch Community**. Previously, each integration required separate authorization, import/sync and connection actions, with duplicate controls on Overview. The guided action now:

1. Checks the authenticated town owner's actual grants and explains missing access.
2. Uses the existing state-bound Twitch OAuth upgrade for selected missing features, retaining already granted community permissions. It uses only the existing `moderator:read:followers`, `channel:read:subscriptions` and `user:read:chat` scopes; basic login is unchanged.
3. Returns to Community and consumes a recent same-town, tab-local pending intent once. The server rechecks identity, CSRF, town ownership and scopes before continuing. A redirect or browser-stored preference does not prove authorization. Denial/missing grants produce a recovery message, never an automatic OAuth loop.
4. Starts any incomplete selected follower import and subscriber synchronization, quietly importing historical records through the existing verified services. These are independent jobs; overlapping memberships still reconcile into one resident. Completed imports are skipped on routine reconnects.
5. Starts eligible selected live integrations on one shared EventSub socket. Permission, historical import progress and actual live subscription readiness are shown separately. **Connected** requires all selected features to be granted, their imports complete and their listeners ready.

**Advanced Settings & Troubleshooting** is collapsed by default and retains the original individual authorization, Community Import/reimport/retry, subscriber sync, connection/disconnection and diagnostic controls. A normal retry keeps completed work. Deliberate reimports remain explicit. Unchecking a feature excludes it from this setup; it does not revoke existing access or stop an existing listener—use Advanced Settings to disconnect. Subscriber availability remains subject to Twitch's existing broadcaster eligibility rules.

Town Overview now shows a compact Community Connection summary and management link. Its existing chat/activity polling, subscriber presentation cursor, saved-town revision refresh, Mayor reactions and authorized demo/live source controls remain mounted. OBS URLs, grants and presentation behavior are unchanged.

Selections are non-sensitive browser-local preferences per town. OAuth continuation is tab-local, single-use and expires after ten minutes. If browser storage is unavailable, the intent expires, another town/account is active, or the server restarts during OAuth, continuation is not inferred: return to Community and click the action again. After a server restart, click Connect to restore live listeners; already completed imports are retained. This is still the existing single-instance deployment architecture. All enabled types share one EventSub socket: one failed subscription can hold readiness back for the whole socket; advanced controls can isolate the failing feature. No new environment variables or migrations are needed.

Manual verification (fully restart Node after these server changes; use `http://localhost:3000`, not an alternate local origin):

1. Sign in, open My Town → Community, select only the features you want and click Connect. Check the missing-permission explanation and Twitch consent screen. Approve and confirm automatic return/continuation, import progress and live readiness without a second setup click.
2. Decline an upgrade. Confirm a clear recovery message and no redirect loop. Uncheck an unwanted feature and retry. Already granted features and existing houses must remain intact.
3. Click Connect again, including from a second tab while setup runs. Completed imports must not restart; readiness must reflect actual subscriptions. For a fresh import, verify follower/subscriber overlap produces one resident and no historical welcome/celebration replay. Existing customization, positions and Mayor settings must remain.
4. Use Advanced Settings to deliberately disconnect/reconnect a feature, sync subscribers or reimport. Verify the summary reports partial/lost readiness accurately and retains successful progress if a step fails.
5. Restart Node, return to Community and reconnect. Completed imports should be skipped. Send real chat, verify the Overview counter/activity, then check Mayor reactions and both existing OBS modes. Overview should link here without authorization/sync panels; authorized simulation/source controls should still work.

Automated coverage uses synthetic OAuth/EventSub responses and disposable local PostgreSQL fixtures; no live Supabase/Twitch calls or browser automation. Changed areas: the new setup route, coordinator/model/HTTP helpers and Community Connection component; fixed-purpose OAuth return metadata; follower-only import option; batched shared-socket start; Overview/management control presentation; regression tests and documentation.

Prompt 020 file inventory:

- Added `src/app/api/community/setup/route.ts`, `src/components/community-connection.tsx`, and `src/lib/community/setup.ts`, `setup-http.ts`, `setup-model.ts`, `setup.test.ts`.
- Updated `src/components/streamer-workspace.tsx`, `town-experience.tsx`, `chat-connection.tsx`, `subscriber-housing.tsx`, and `src/app/globals.css`.
- Updated `src/lib/auth/http.ts`, `service.ts`, `store.ts`, `types.ts`; `src/lib/chat/manager.ts`; `src/lib/community/service.ts`; and `src/lib/persistence/persistence.test.ts`.
- Updated `README.md` and `TASKS.md`. Validation: TypeScript, lint, all 267 tests, production build and Git diff checks passed. Real Twitch approval and browser/OBS presentation still require the manual checklist above.

## Town Overview development reload loop (Prompt 019B)

`npm run dev` now uses Next's supported **Webpack** development bundler. The previously running Next 16.4.3 Turbopack server repeatedly sent an HMR `restart` instruction for its shared runtime entry chunk on fresh subscriptions; Next's client executes `location.reload()` for that instruction. This restarts the whole document, account request, loading boundary and renderer. An HTTP/HMR probe reproduced it on the public home page with and without `utm_source`, independent of authentication and Mayor reactions. The internal reason Turbopack invalidated that chunk is not established; this is a narrow development-bundler workaround, not an authentication change. Production still uses `next build` / `next start`.

Fully stop the old development process with Ctrl+C, then run `npm run dev`; the startup banner should say **webpack**. A browser refresh alone cannot switch the server bundler. Visit `/town-overview`, then `/town-overview?utm_source=chatgpt.com`. Let each settle for at least 30 seconds. A first route compilation/loading state is expected; repeated document requests, resetting account checks and recurring centered loaders are not. Check the saved town, camera, Mayor reactions, simulator/live-source switching and live chat counter. Focus the tab again to confirm ordinary account/town refresh still works. For production, stop development, run `npm run build` and `npm start`, and repeat both URLs. Check Follow Mayor and Mayor Spotlight with the existing OBS URLs.

Protocol regression checks (no browser automation): `npm run test:overview-runtime` starts an isolated copy on a temporary port, with synthetic memory-backed auth and no database credentials. It verifies completed Overview HTML, successful session responses, harmless query parameters, protected live APIs and active HMR without document restart instructions. Initial route compilation may issue an ordinary server-component refresh; settled requests must not repeat it. `npm run test:overview-runtime -- --production` checks the existing production build on a temporary port using synthetic memory auth and disabled database configuration. Neither check logs in to Twitch, connects chat or accesses live Supabase. These are HTTP/HMR checks, not substitutes for manually verifying browser hydration, Pixi graphics or a real signed-in session.

## Mayor celebrations (Prompt 019)

Town Overview, Follow Mayor and Mayor Spotlight share the same transient reaction model, timing and vector poses. No migration, credentials, OAuth permissions, EventSub subscriptions or membership rules change.

| Verified event | Mayor reaction | Duration |
| --- | --- | --- |
| Newly active subscriber (`channel.subscribe`) | Happy hop, raised paws, sparkles | 3.2 seconds |
| Verified shared resub message (`channel.subscription.message`) | Left-right welcome-back dance | 4 seconds |
| Individual gifted subscription (`channel.subscribe`, `is_gift`) | Excited wave/hop and gift icon | 3 seconds |
| Community gift batch (`channel.subscription.gift`) | Larger dance/jump, confetti and verified quantity | 4.8 seconds |
| Genuinely new follower (`channel.follow` v2) | Brief friendly wave | 1.8 seconds |

Reactions use existing verified server event processing and per-view presentation buffers. Historical Community Import and ordinary subscriber synchronization do not replay subscription celebrations. A resub reaction follows a shared resub message with current membership verified by the existing service, not an inferred automatic billing renewal. A follower already represented in town does not arrive again. No new live raid, Bits or donation integration is added.

The Mayor pauses at its current position and resumes the existing route after playback. Follow Mayor keeps the reaction in its camera frame; Spotlight animates the enlarged foreground Mayor, including its gift icon/count on transparent backgrounds. Left/right and scale settings remain available; oversized Spotlight scales are capped to fit the expanded paw/particle envelope. All four appearances retain their palette, markings and scarf. Personality energy subtly scales motion amplitude; every personality plays every reaction. Reduced motion removes hopping, dancing, tail motion and moving particles, retaining a brief static paw pose and gift/count cue.

Each view has one active reaction, at most eight waiting reactions and 512 expiring dedup keys. Gift batches have highest priority; followers have lowest. Recipients coalesce while a gift is active/pending and for an eight-second gift cooldown. A batch removes waiting recipient reactions and can interrupt an individual gift. Only one additional batch waits during a burst; quantities are never summed or attributed to guessed recipients. Ordinary subscriptions and resubs are **not subject to the gift cooldown**, but all visuals remain subject to capacity and expiry. There is no reliable Twitch batch-to-recipient correlation: unrelated individual gifts close together may share one visual celebration. Housing and membership events still all reconcile independently. After twelve seconds of continuous reaction playback, a two-second break allows ordinary Mayor activity. Existing house visits and neighborhood tasks remain in place.

Particles use a fixed pool of 24 graphics per Mayor view (ten for small celebrations); poses and particle paths are deterministic and use no new animation library. Graphics/listeners are destroyed with the existing scene lifecycle. First-buffer baselines prevent refresh replays; separate browser/OBS views consume independently. Buffers are short-lived, so outages, overload or a view opened after an event can miss a celebration without losing the saved resident/house. Browser GPU/OBS performance and real live delivery still require manual verification.

### Manual verification

1. For local simulation, set the existing `TOWN_DEMO_MODE=true` in your local configuration, keep `PUBLIC_DEPLOYMENT` disabled, and run `npm run dev`. Do not expose development demo controls on a public deployment. At `/town-overview`, switch to the clearly labeled simulated source and open **Event simulator**.
2. Trigger **New subscriber** (hop), then **Resubscription** (dance, same resident/home), **Individual gift · simulated** (gift wave), **Gift 2 subscriptions** (major celebration/count), and **New follower** (short wave, no home). Resub requires an existing demo subscriber. **Retry last event ID** must not replay or allocate anything.
3. Send a gift batch and several recipients quickly, then an unrelated new subscriber. Expect one active animation, coalesced gift visuals and the ordinary subscription still eligible to play. Confirm normal movement resumes. Reset demo town and confirm no old cues return; verify your live town is unchanged.
4. Open `/demo/obs-preview`, select Follow Mayor or Spotlight, and use the **SIMULATED REACTIONS** buttons. Test Spotlight left/right, scale 0.5/1/1.5 and town/transparent backgrounds. **Open OBS capture view** preserves those display settings. Add its localhost URL as an OBS Browser Source at **1920×1080**, use OBS **Interact** to trigger the same buttons, and retain the visible demo label in footage. These controls affect only that preview instance, never a saved town or production overlay.
5. For verified live checks, rebuild with `npm run build`, run `npm start`, sign in and connect the existing subscription events and live follows. Open Town Overview and your existing private OBS URL before the event so their initial buffers are baselined. When genuine authorized events are available, compare the five reactions in Follow Mayor and Spotlight; no secret URL rotation is necessary. Do not interpret simulator success as live Twitch verification.
6. Repeat with each saved Mayor appearance and personality. Enable your OS/Chrome reduced-motion preference while the scene is open: motion and particles should stop while static gift/count feedback remains. Refresh after a reaction and confirm it does not replay. Check pan/zoom, chat activity, customized houses, subscriber counts and expansion remain intact.

Implementation files: `src/lib/mayor/reactions.ts`, `reaction-pose.ts`, `src/lib/rendering/mayor-reaction.ts`, the existing simulation/renderer/OBS playback and model files, Town Overview and simulator/preview components, the development preview route and CSS. Regression coverage is in `src/lib/simulation/mayor-reactions.test.ts`, existing simulation tests and the persistence integration tests. Live Twitch events have not been manually verified by this task.

## Community Import and live follows (Prompt 018)

After creating a town, onboarding opens **My Town → Community → Community Import** at `/dashboard/town#community`. Existing owners can open that section directly. This optional step does not block settings, house management or OBS.

**Authorize Community Import** adds `moderator:read:followers` and requests `channel:read:subscriptions` if not already granted. Existing chat and subscriber permissions are retained. Basic viewer login stays scope-free. No new environment variables, Twitch app settings, OBS credentials or SQL migration are required; use the existing server configuration and deployed schema 001–006. Credentials remain server-only.

The server reads [Get Channel Followers](https://dev.twitch.tv/docs/api/reference/#get-channel-followers) for the authenticated broadcaster, in pages of 100, then reuses subscriber synchronization. Followers/subscribers share one town-scoped Twitch identity. Subscribers receive existing available cottages before new construction; houses, customization, Mayor settings and existing geometry are retained. Historical members settle without arrival effects. An import never guesses identities from follower totals.

Progress is saved in the existing town JSON through owner-checked revision transactions: followers discovered, subscribers discovered, unique successfully reconciled members, newly assigned subscriber homes and phase/status. Counts include existing members reconciled during this run, not only newly created residents. They are checkpoint counts, not an atomic snapshot of Twitch. Complete means both scans/reconciliation completed; incomplete permissions, failed pages, waitlists or storage failures are not reported as success.

Retries rescan from the beginning with durable event deduplication and existing allocation rules. Saved members survive errors. Only one persisted import lease per town can run at once; after interruption, Retry becomes available when the last five-minute lease expires. Checkpoints renew before each page and every 20 successful records. A crash can leave displayed counts behind the saved members until a retry; it does not roll back their homes. There is no in-memory fallback for progress persistence. Ordinary subscriber sync can safely overlap through the existing revision/receipt protections, but an already running subscriber sync makes the combined import incomplete until retried.

Follower requests have a 10-second timeout and at most four attempts, with 1/2/4-second backoff for network/server failures and bounded rate-limit waits (up to 30 seconds per wait). Longer limits require manual Retry. Each import is bounded to 500 pages, 10,000 follower identities and ten minutes; subscriber limits and the existing world size/housing limits also apply. Large channels may need a future dedicated batching/queue architecture: current persistence writes full town snapshots. Unsupported subscriber access (for example, a channel without subscriber API availability) preserves imported followers and reports an incomplete subscriber phase.

**Connect live follows** registers [channel.follow v2](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channel-follow) on the shared chat/housing WebSocket with both broadcaster and moderator IDs set to the authenticated broadcaster. “Subscription ready” requires a matching enabled subscription response, not just a welcome frame. Valid notifications use the durable town event ledger; duplicate deliveries create neither duplicate residents nor homes. Existing subscribers retain their homes and do not arrive again when they first follow. Live follows use the existing newcomer behavior only for genuinely new residents. The live queue is bounded to 1,000 total pending follows and eight attempts; it is not durable. Reconnect after a backend restart; a later import can repair membership missed while disconnected, without replaying historical arrivals.

Manual verification with a real Twitch account (not yet performed by automated tests):

1. Stop the existing process. Run `npm run build` then `npm start` in this directory (or `npm run dev`). Sign in as the broadcaster and open `/dashboard/town#community`; new-town onboarding opens this step automatically.
2. Select **Authorize Community Import**, approve follower/subscriber permissions, and confirm the same Twitch account returns to Community Import. Missing/rejected scopes must remain actionable errors; viewer login alone must not authorize import.
3. Select **Import my community**. Watch follower/subscriber/unique-resident/home counts and the phase. The town remains usable during processing. An empty channel should complete with zero members; a subscriber-only channel should still get residents/homes when the API supports that channel.
4. Open Town Overview and confirm established residents populate quietly, subscriber/follower overlaps are one resident, and existing customized homes, Mayor and camera behavior remain intact. Retry/reimport and confirm no additional homes are allocated to the same people. Compare the town with the same account after a full reload.
5. Select **Connect live follows** and wait for **subscription ready · channel.follow v2**. From a second real account that is not already represented, follow the exact broadcaster channel. Confirm one new resident and the existing arrival behavior, with no house for a follower. Chat and subscriber EventSub should keep working on the same shared connection.
6. For interruption recovery, stop the backend during an import, restart, reopen Community Import, and wait for the previous lease to expire. Retry should reconcile the retained residents without deleting/resetting homes. If a Twitch or storage failure occurs, expect partial/failed status and a contextual message, not “complete.”
7. Keep an existing OBS source at 1920×1080 open in each mode while importing. Confirm quiet historical population updates, live newcomers, preserved layout/Mayor/camera framing and unchanged private access URL. No browser automation or live Twitch/Supabase testing is included in the automated validation.

A cozy, seeded 2D village for the Codex x TwitchCon Hackathon, with a renderer-independent event simulation and Mochi, its cat-like Mayor. The Town Overview supports Twitch login, real chat, persistent Supabase towns, verified subscriber imports and live subscription housing. Other community events remain simulated in an isolated demo.

**Public deployment:** see [DEPLOYMENT.md](DEPLOYMENT.md) for the readiness assessment, Render/Railway comparison, environment checklist, manual migrations, HTTPS/OBS checks and restart/rollback procedures. Prompt 011A adds durable encrypted authentication, API rate budgets and `/api/health`. Public hosting requires one continuously running Node process, migration 006 and `AUTH_STORAGE=supabase`; no deployment or live migration has been performed.

**Multi-town audit (Prompt 014):** see [MULTI_TOWN_AUDIT.md](MULTI_TOWN_AUDIT.md) for identity/ownership findings, authorization boundaries, missing navigation, subscription lifecycle and the proposed Extension adapter. Core cross-town ownership is supported; the full experience is partially supported. No identity migration is required.

## Run locally

### Adaptive resident density (Prompt 017C)

This section supersedes older 24-actor and four-ambient-OBS descriptions below.

**Audit findings before implementation:** the old 24 cap was global per session, not per neighborhood/viewport/mode. It selected the first 24 unique resident records during hydration/reconciliation and limited newcomer actor creation. Every selected actor was simulated at the existing model tick rate and every resident graphic interpolated on each render frame, even offscreen. Scenery culling did not include residents. Saved actors were stable across same-town refresh and camera movement, but the oldest-record selection favored earlier neighborhoods. Both isolated OBS preview modes shared this rule. Production OBS was different: its privacy-filtered world had no residents and playback injected four scenery actors, independent of actual population. Follow Mayor and Spotlight shared that four-actor fallback.

**New density:** one actor per recorded unique resident up to a **256-actor pool**. Beyond 256, selection round-robins the populated technical districts, with stable resident order within each district, instead of keeping only the oldest 256 residents. Housed residents initialize at their home entrances; unhoused residents receive deterministic placements across plots in populated districts (or the built initial settlement when nobody has a house). Existing actors retain position and movement state through refresh/expansion. New residents still enter at Town Hall using existing arrival behavior; the allocator reconciles district representation at event boundaries. No population counters, ownership records or event reactions are changed.

| Recorded residents | Actor pool in Overview / either OBS mode |
| --- | --- |
| 0 | 0 |
| 12 | 12 |
| 30 | 30 |
| 60 | 60 |
| 100 | 100 |
| 200 | 200 |
| More than 256 | 256, sampled across populated districts |

The pool is not the number simultaneously visible in the camera. The 256 limit accommodates all requested 100–200-resident scenarios with headroom while bounding simulation state, resident graphics and per-frame candidate checks. It is an engineering budget for these small procedural vector actors, not a measured GPU capacity limit. Large follower-only populations are sampled too; no houses or fake residents are created to fill the pool.

**Camera/render optimization:** actor selection does not change during camera movement. Existing graphics remain allocated (at most 256), avoiding allocation churn while panning. Only actors inside the camera plus a **96-screen-pixel entry margin** receive visible interpolation/drawing. Once visible they remain eligible until outside a **160-pixel exit margin**, avoiding boundary flicker. Returning actors synchronize to their current model position before a roughly **125ms fade-in** (immediate for reduced motion). Far-away graphics are hidden and skip interpolation; their bounded model movement continues at the existing tick rate so returning to a neighborhood does not restart its walkers. Transparent-only Spotlight skips all background resident drawing. Both modes use the same policy, with their existing different camera framing. Broad Spotlight/Fit views can legitimately show the whole actor pool.

**Production OBS:** after existing bearer authorization, the server sends a separate bounded visual roster derived from real resident records. IDs are HMAC aliases using a random server-instance secret, not the browser's OBS grant. Only opaque IDs, spawn navigation nodes and technical district IDs are included—no Twitch IDs, names, subscription evidence, or private house ownership fields. The sanitized world still has `residents: []`. Playback reconciles these visual actors without creating permanent residents. The roster is sent on polls even when world revision is unchanged; aliases are stable through page refresh and mode changes in one server process. Server restart rotates the alias epoch and rehydrates established actors without arrival effects. No new environment variables, database tables, scopes, credentials or access rules are required. An older server response without the roster is accepted, but cannot supply adaptive population until the server is upgraded. Public visitor snapshots remain privacy-filtered and are not given this authenticated OBS roster; unsaved chat previews retain their separate scenery behavior.

**Performance evidence and limitations:** deterministic tests exercise all six population sizes, both playback modes, populated-district coverage, duplicate-free sources, hydration and unchanged-world reconciliation, 1920×1080 camera math, overscan hysteresis, transparent mode, privacy and tenant/demo isolation. Additional cases check 300 residents and a synthetic 10,000-record population remain bounded at 256 actors. CPU diagnostics measure 100 model ticks per scenario; these are not GPU/FPS measurements. Static scenery, roads/flowers, full-world polling/projection, sorting and WebGL work can still dominate large scenes. Model actors keep wandering and may cluster over time; neighborhood balancing defines the represented population and initial placement, not forced geographic quotas every frame. Newcomers still begin at Town Hall and may take time to disperse. Above 256, not every real resident near a camera is guaranteed an actor; the district-balanced sample prioritizes coverage while viewport culling prioritizes work. Hardware testing is needed before raising the budget or claiming 60 FPS.

Manual 1920×1080 checks (no browser automation performed):

1. Run the existing local-only development setup with `TOWN_DEMO_MODE=true` and `npm run dev -- --hostname 127.0.0.1`. Open `/demo/obs-preview`; select **100**, then **200** houses and Apply Preview. Each fictional house owner supplies one recorded resident. Allow initial generation to finish.
2. Choose **Living Town · follow Mayor**, open its OBS capture view and add that localhost capture URL to an OBS Browser Source configured to **1920 width × 1080 height**. Watch several neighborhoods as the Mayor moves. Check that nearby streets contain residents, camera-edge motion does not repeatedly pop actors in/out, and house/Mayor behavior remains intact.
3. Repeat with **Mayor Spotlight** using its own capture URL at 1920×1080. On the preview control page, zoom and pan between distant neighborhoods, then return. Walkers should retain their identities/movement within that view, with a short fade when entering the view. Capture and control pages have independent clocks/cameras; do not expect synchronized positions. Check transparent-only Spotlight on an already configured authorized overlay: no hidden town walkers should be drawn.
4. In Chrome's Performance/Memory tools or OBS Stats, compare idle/moving-camera behavior at 100 and 200 residents. Repeat count/seed changes and source refreshes. Watch for sustained frame stalls or steadily increasing memory after old scenes are disposed; heap usage may fluctuate with garbage collection. No fixed FPS threshold has been certified.
5. For smaller exact populations, reset the isolated Overview simulator: zero initially; **Add 12 demo subscribers** gives 12; twice plus six **New subscriber** clicks gives 30; **Add 48** plus **Add 12** from reset gives 60. Confirm counters, new arrivals and no duplicates on **Retry last event ID**. Both OBS modes at these exact counts are covered by synthetic playback tests; the existing OBS preview selector remains 25/50/100/200 houses.
6. On an existing saved community, refresh Overview and an authorized OBS source. Existing residents should not receive new-arrival effects; actual permanent counts/houses remain unchanged. Compare loaded distribution in the two modes without exposing the private OBS URL. Restarting the server intentionally resets ephemeral aliases and movement, not saved population. Do not generate live subscriptions or change Supabase data for this test.

Files for this change: updated `src/lib/simulation/residents.ts`, `engine.ts`, `population.test.ts`, `expansion.test.ts`; `src/lib/rendering/create-renderer.ts`; `src/lib/overlay/service.ts`, `playback.ts`; and `src/lib/persistence/persistence.test.ts`. New: `src/lib/overlay/population.ts`, `src/lib/rendering/resident-visibility.ts`, `resident-visibility.test.ts`, and `src/lib/simulation/density.test.ts`. Documentation: README, TASKS and DECISIONS. Previous uncommitted Prompt 017A/B changes are preserved.

Validation completed: TypeScript, lint, **230 automated tests** (zero failures/skips), production build and tracked/new-file diff whitespace checks passed. Existing database fixtures are disposable and local. No live database operations, migration commands, browser automation, new Mayor reactions, commits, pushes or deployment were performed.

### Housing and population consistency (Prompt 017B)

New housing allocations now assign an existing unowned cottage first. Only when no unowned cottages remain does the shared simulator/server processor construct on a vacant plot (original reserve plots first). Existing owners, legacy properties, customizations and positions are retained. No migration or rewrite of saved towns is needed; the existing transactional RPC, revision retries and event receipts still protect concurrent live allocation.

**Neighborhoods** now means **one initial settlement + completed expansions**, using the same helper in Town Overview, Dashboard, management Community, public town visits, the event simulator and expanded OBS preview. The seven initial residential district records remain technical subdivisions. Only confirmed worlds supply counts; failed/rolled-back expansion is not counted. “Available housing” includes unassigned cottages and vacant plots; management's “Vacant / total plots” counts empty land. Subscriber owned still includes retained legacy ownership; active homes remains a separate verified count. Chat scoring is unchanged.

Fresh-town expectations (each subscriber is a distinct synthetic identity):

| Subscribers / owned homes | Cozy homes | Neighborhoods | Total plots | Available housing |
| --- | --- | --- | --- | --- |
| 0 | 12 | 1 | 14 | 14 |
| 1 | 12 | 1 | 14 | 13 |
| 10 | 12 | 1 | 14 | 4 |
| 11 | 12 | 2 | 26 | 15 |
| 12 | 12 | 2 | 26 | 14 |
| 13 | 13 | 2 | 26 | 13 |
| 14 | 14 | 2 | 26 | 12 |

The expansion threshold remains **fewer than four available housing slots** and each expansion adds **12 vacant plots**, not 12 buildings. Subscribers 1–12 reuse cottages; subscriber 13 builds on the first original reserve plot. Existing saved towns keep their current houses, so their totals need not match this fresh-demo table.

**Per-view celebration delivery:** each Overview/OBS view baselines the first successful poll, suppressing all events already in that buffer, including previously handled events after a full refresh. Later unexpired unseen event IDs are admitted once per view. Temporary outages preserve that cursor, so a genuinely new event after reconnection can play; each simultaneously connected view keeps its own cursor. There is no global consumed flag, browser storage, new table or authorization change. The server's existing duplicate-delivery receipt remains authoritative for durable changes.

This is live-only presentation, not guaranteed replay: events already buffered when a view opens (including those arriving before its first successful poll), missed during a long outage, expired, or lost on server restart are not recovered. Queues remain bounded; the cursor retains unexpired IDs up to 2,048 and drops excess work under saturation. No durable residents or houses are lost when a visual reaction is skipped. OBS reaction priority/animations are unchanged.

**Visible residents:** saved records are reconciled by stable town-scoped resident ID, with at most **24** walking resident actors (the first 24 unique records). Initial hydration places established actors near their home entrances or on deterministic town paths, without arrival effects. Same-town synchronization retains existing motion, adds missing actors and removes stale/duplicate entries; genuinely new records in an already displayed world can enter at Town Hall. The renderer retains matching graphics and destroys stale ones. Counts always describe the full recorded population, not just the visible subset. Saved Overview towns no longer acquire fictional ambient actors when empty. Unsaved chat previews and privacy-filtered OBS retain their existing scenery actors; public/OBS payloads still do not expose private resident identities. Separate browser views retain independent movement clocks.

Gift aggregates still do not invent recipients or house the giver. Known fictional recipients, verified live recipients, follower upgrades, resubscriptions and cross-town ownership use the existing deduplication/entitlement rules. No new Twitch events, scopes or Mayor animations were added.

Manual verification (no automated browser testing performed):

1. In a PowerShell terminal at `F:\Development\TwitchLivingTown`, run `npm run dev`. Open `http://localhost:3000/town-overview` using the existing local development/demo authorization. Select the **simulated** source and open **Event simulator**. These steps must not use the Subscriber Housing sync/connect controls to fabricate data.
2. Click **Reset demo town**. Confirm 0 residents, 12 cozy homes, 0 subscriber owned, **1 Neighborhood**, 14 plots and 14 available housing slots. Click **New subscriber** once: an existing cottage becomes owned, cozy homes stays 12, and a newcomer/housewarming can appear.
3. Click **Retry last event ID**: no extra person, house or celebration. Continue **New subscriber** to totals 10, 11, 12, 13 and compare the table above. At 11, use **Fit town (0)** to inspect the added vacant district. At 13, confirm a new house appears without moving the original cottages. Pan/zoom and observe the Mayor as usual.
4. Click **Resubscription**: the existing subscriber keeps one home and receives the existing welcome-back reaction. Reset the demo and click **Gift 2 subscriptions**, then **Replay gift recipients** and **Retry last event ID**. Expect two residents/owned cottages, 12 cozy homes and two community gifts; no giver house or duplicate ownership. **New follower** creates a resident without consuming housing; follow-to-subscribe for the *same identity* is covered by automated tests because those two UI buttons generate separate sample identities.
5. For saved-town checks, stop the development server, run `npm run build` then `npm start`, and sign in normally. Compare neighborhood counts in `/town-overview`, `/dashboard`, `/dashboard/town` → Community, and the **Visit Town** link. Refresh: established residents should remain represented (up to 24), houses/customization should remain, and old celebrations should not restart. Ordinary production UI must not expose the development simulator without its pre-existing explicit authorization.
6. With Overview and an existing authorized OBS browser source already open and initialized, observe a legitimate new verified subscription/resub/gift event when one is available; do not manufacture a live subscription or buy one just for testing. Both connected views may react. Refresh a view while that event is still buffered: it must not react again. Temporarily disconnect/reconnect that view and observe a subsequent genuine event: the new event may react. Repeat with OBS Living Town and Mayor Spotlight using existing credentials/settings. Live connectivity and visual performance still require this manual verification.
7. To inspect a larger isolated demo, use the existing development-only `/demo/obs-preview` opt-in and choose a supported house total. Confirm conceptual neighborhood labels and both presentation modes. Demo reset/reload never changes your saved town.

Implementation files: new `src/lib/simulation/population.ts`, `residents.ts`, `presentation-cursor.ts`, `population.test.ts`, and `presentation-cursor.test.ts`; updated `simulation/engine.ts`, `world.ts`, `simulation.test.ts`, `population-audit.test.ts`, `chat/projection.ts`, `overlay/playback.ts`, `overlay/overlay.test.ts`, `persistence/persistence.test.ts`, `rendering/create-renderer.ts`, and `security/navigation.test.ts`. UI wiring/labels: `src/components/town-experience.tsx`, `town-preview.tsx`, `subscriber-housing.tsx`, `streamer-workspace.tsx`, `account-dashboard.tsx`, `event-simulator.tsx`, `expanded-obs-preview.tsx`, plus `src/app/towns/[townId]/page.tsx`. Documentation: README, TASKS, DECISIONS and the historical audit notice.

Validation: lint, TypeScript, **221 tests**, production build and tracked/new-file diff whitespace checks passed. Nine regressions were added beyond the 212-test audit baseline, with older allocation assertions updated to the new policy. Tests use synthetic identities and existing disposable local database fixtures; no live Supabase data was read or modified. Browser/OBS performance and live Twitch connectivity remain manual checks.

### Population and event audit (Prompt 017A)

See [POPULATION_EVENT_AUDIT.md](POPULATION_EVENT_AUDIT.md) for exact counter formulas, identity lifecycle, housing allocation and expansion, gift reconciliation, Mayor/OBS behavior, and follow-up recommendations. The audit changes documentation and adds four synthetic regression tests only. In particular, “New neighborhoods” counts expansions (initially zero), available housing includes unassigned built homes, and live gift totals are not unique recipient counts. UI labels, entitlement rules and reaction behavior are unchanged.

### Simplified Overview controls (Prompt 016B)

The standard `/town-overview` keeps **Manage My Town**, without routine **Reload saved town** or **Regenerate town** buttons. Saved data still loads on the server and refreshes automatically through the existing authenticated `GET /api/town` on client mount, window focus and `living-town:reload` events. A failed client load shows contextual **Retry** using that same abortable read path; it disables itself while retrying and disappears after success. Transient failures retain the last known town. Authentication failures still clear the client town. Initial server-load failures retain the existing Try again link.

Before this change, Reload saved town simply invoked that same read; it did not regenerate or save anything. Regenerate town chose a different cryptographic random seed and remounted the in-memory demo scene. It did not call a persistence mutation, but its disabled production button was confusing and its local action discarded the demo session's state. It now appears as **Regenerate demo town** only inside **Development tools · simulated town**, with all three conditions required: development runtime, server-authorized simulator, and simulated view. The handler repeats those guards. Production hides it even with explicit demo opt-in. Permanent houses/layouts have no write path through this control.

Reset demo town in the event simulator still resets the current demo seed/session; management reloads, subscriber sync, renderer/camera controls and the isolated expanded OBS demo retain their separate behavior.

Manual check: restart with `npm run build` then `npm start`, sign in and open `/town-overview`. Confirm the correct saved town and Manage My Town appear automatically, with neither routine control. In Chrome DevTools, temporarily block `/api/town` after the page has loaded and refocus the tab: expect a loading error plus Retry while the town stays visible. Unblock the request and click Retry; expect recovery and removal of Retry. Check Mayor/camera/chat as usual. Separately, in local development with the simulator authorized, select the simulated town and expand Development tools; regeneration should change only its demo seed/layout. Return to live view and confirm the saved town is unchanged. Do not confuse this with Reset demo town or settings reload.

Files: `src/components/persistent-town.tsx`, `town-experience.tsx`; new `src/lib/persistence/town-loader.ts` and `town-loader.test.ts`; updated `src/lib/security/navigation.test.ts`, README and TASKS. No migrations, backend mutation changes or production-data modifications.

### Navigation and public home (Prompt 016)

This section supersedes earlier instructions that used `/` for the interactive Overview or `/account?auth=signed_out` after logout.

| Route | Purpose |
| --- | --- |
| `/` | Public welcome page, fictional read-only Meadowbrook preview, streamer/viewer explanation. Connect with Twitch becomes Go to Dashboard when signed in; browsing home never redirects you away. |
| `/dashboard` | Personal hub with a direct Open Town Overview action, own-town summary and authorized houses across communities. |
| `/town-overview` | The original interactive `TownExperience`, existing PixiJS renderer, Mayor, camera, saved-world loading and Twitch integrations. Normal production requires a signed-in owner; no-town users get onboarding/property links. Existing explicitly permitted local simulation remains isolated here. |
| `/dashboard/town#settings` | Town & Mayor configuration and preview. |
| `/dashboard/town#community` | Resident/capacity statistics, existing chat connection and subscriber housing/sync controls. |
| `/dashboard/town#obs` | Stream Display / existing OBS configuration and URL management. |
| `/my-houses` and `/my-houses/[townId]/[houseId]` | Existing owner-filtered property discovery and customization. |
| `/towns/[townId]` | Read-only saved-town visit with a larger responsive viewport; not the interactive owner Overview. |
| `/account` | Twitch identity, connection errors and account management. |

One shared responsive website header provides Dashboard, Town Overview, My Town, My Houses and Account for signed-in users, with a current-section indicator and Sign out. The mobile Menu has keyboard focus, Escape handling and a skip link. My Town can open onboarding for accounts without a town. Deeper property/visit pages retain contextual navigation. OBS routes and the isolated expanded OBS preview do **not** mount this header or its authentication polling.

Management uses three anchor-linked sections rather than unmounting tabs. Drafts and generated private OBS URLs stay mounted when moving between sections; explicit reload still discards drafts as labeled. Existing `#settings` and `#obs` links remain valid. The dashboard keeps navigation separate from secondary OBS/account utilities.

The shared `TownLoading` uses the existing SVG Mayor with a gentle CSS bob and three pulsing dots, polite status announcements, contextual messages, full-page/compact variants and reduced-motion support. Dashboard, onboarding, properties, account, Overview, town visitor, renderer fallbacks and OBS settings reuse it. No artificial loading delay or animation dependency was added. Content fades briefly; camera/Mayor frames are not reanimated by page transitions.

Basic OAuth still persists the session before going to `/dashboard`. Existing chat/subscriber scope-upgrade returns now point to `/town-overview?chat=authorized` or `?housing=authorized`. Successful acknowledged logout clears cookies/revokes the session before navigating to `/`; failure stays on the current page with an error. No scopes, CSRF checks, encryption or ownership rules changed.

The landing preview uses a fixed fictional world and the existing read-only `TownPreview`, not `TownExperience`, the event simulator, a saved account, or a production OBS grant. No environment changes or migrations are required. The expanded OBS demo's Reset now returns to `/town-overview` to preserve its original destination.

Manual Chrome checks (no automated browser interaction was performed):

1. Stop any running local server; in `F:\Development\TwitchLivingTown`, run `npm run build`, then `npm start`. Open `http://localhost:3000/` signed out. Check the hero, sample Mayor/village, camera controls and Explore Living Town explanation; no simulator or private town should appear.
2. Connect with Twitch and confirm `/dashboard`. Use Open Town Overview directly. Confirm the saved town, Mayor, pan/zoom and existing chat/subscriber controls; authorize a scope if intentionally testing it and confirm return to `/town-overview`. Visit `/` while signed in: the public page remains, with Go to Dashboard.
3. Check accounts with no town, houses only, town only, or both. In normal production, signed-out Overview access requires connection and a signed-in no-town account receives Create My Town / My Houses choices. No placeholder property is allocated. Check each cross-town Visit and Customize link.
4. Open `/dashboard/town#settings`, edit a field without saving, then use Community and Stream Display section links and return. The unsaved field must remain. Verify existing loaded settings; do not generate/regenerate/revoke a real OBS URL unless deliberately testing that action. Existing owner-only save/OBS authorization is unchanged.
5. Check desktop (~1440px), tablet (~900px), and mobile (~390px) widths. Use keyboard Tab, Enter, mobile Menu and Escape; verify visible focus, active section, wrapped cards, usable Mayor selectors and no horizontal overflow. The visitor canvas should occupy most available vertical space.
6. Use Chrome network throttling to inspect actual pending loaders on navigation/My Houses/OBS settings, then restore normal networking. Disconnect networking to confirm failures show retry/account guidance instead of an endless loader. Enable reduced motion in Chrome rendering preferences: decorative loading/page animations should stop. Rendering still requires WebGL.
7. Sign out from the header or Account. Expect `/` only after success; reload `/dashboard` to verify login is required. Persistent-auth logout/restart and failure paths are covered by local automated tests. The browser should stay put and show an error if logout fails.
8. Verify an existing OBS Browser Source has no website navigation or margins added. Stop production mode, then use the Prompt 012 instructions below to check local expanded preview, simulation isolation and Reset to `/town-overview`.

Remaining limits: visitor/sample worlds do not show live chat; actual viewport/GPU behavior and Twitch/OBS interaction require the manual checks above. Existing broadcaster-session lifetime, optional name attribution, subscriber entitlement and single-process limits remain unchanged.

Validation: TypeScript, lint, all **204 tests**, production build and tracked/new-file Git diff checks passed. Tests use synthetic services and disposable local databases, plus server-rendered UI/source contract checks; no browser, live Supabase, Twitch or OBS interaction was automated.

Prompt 016 file map: new `src/components/{account-context,website-shell,public-home,home-action,town-loading}.tsx`, `src/app/town-overview/{page,loading}.tsx`, account/My Houses/property loading boundaries, `src/lib/security/navigation.ts` and its tests, and `src/lib/simulation/public-sample.ts`. Updates cover root layout/home, shared-account controls, dashboard/management/property/visitor navigation, Overview initialization, existing renderer loading fallbacks, OBS loading, styles, fixed OAuth/logout/demo-reset destinations and their regression tests. README and TASKS document the changes.

<details>
<summary>Prompt 016 created and modified files</summary>

Created:

- `src/app/account/loading.tsx`
- `src/app/my-houses/[townId]/[houseId]/loading.tsx`
- `src/app/my-houses/loading.tsx`
- `src/app/town-overview/loading.tsx`
- `src/app/town-overview/page.tsx`
- `src/components/account-context.tsx`
- `src/components/home-action.tsx`
- `src/components/public-home.tsx`
- `src/components/town-loading.tsx`
- `src/components/website-shell.tsx`
- `src/lib/security/navigation.test.ts`
- `src/lib/security/navigation.ts`
- `src/lib/simulation/public-sample.ts`

Modified:

- `README.md`
- `TASKS.md`
- `src/app/account/page.tsx`
- `src/app/dashboard/loading.tsx`
- `src/app/demo/house-editor/page.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/my-houses/[townId]/[houseId]/page.tsx`
- `src/app/my-houses/page.tsx`
- `src/app/onboarding/loading.tsx`
- `src/app/page.tsx`
- `src/app/towns/[townId]/loading.tsx`
- `src/app/towns/[townId]/page.tsx`
- `src/components/account-dashboard.tsx`
- `src/components/chat-connection.tsx`
- `src/components/my-houses.tsx`
- `src/components/obs-settings.tsx`
- `src/components/owned-house-editor.tsx`
- `src/components/persistent-town.tsx`
- `src/components/streamer-page.tsx`
- `src/components/streamer-workspace.tsx`
- `src/components/town-canvas.tsx`
- `src/components/town-experience.tsx`
- `src/components/town-preview.tsx`
- `src/components/twitch-account.tsx`
- `src/lib/auth/diagnostics.test.ts`
- `src/lib/auth/http.test.ts`
- `src/lib/auth/http.ts`
- `src/lib/auth/logout-client.ts`
- `src/lib/overlay/preview.test.ts`
- `src/lib/overlay/preview.ts`
- `src/lib/persistence/persistence.test.ts`

</details>

### Unified dashboard (Prompt 015)

Basic Twitch login now lands on `/dashboard` after session persistence succeeds. The hub shows My Town and all owned subscriber houses together, including empty/error states for either section. `/dashboard/town` retains the existing town/Mayor settings, chat and subscriber controls, and OBS settings (`#settings` / `#obs`). `/account` remains account management. Chat/subscriber scope upgrades retain their existing fixed Overview destinations; arbitrary `returnTo`, `returnUrl` and `next` parameters are unsupported and rejected at login.

Both the dashboard and `/my-houses` use owner-filtered property discovery. Cards show town, house name, optional preview, correct Visit Town and Customize/View actions. Streamer attribution follows the town's stored broadcaster ID; a display name is shown only when an unexpired, previously validated profile is already available to the server. Otherwise the card shows the broadcaster ID and “name unavailable.” It never uses the house owner's name as the streamer. Existing database grants do not expose the user-profile table through a read RPC, so this phase adds no migration or broader table permissions.

`/towns/[townId]` renders the existing public projection as a read-only saved-town visit, with camera controls and an animated Mayor. It does not expose subscriber identities, private customization metadata, OBS grants or live chat. Reload to see saved changes. House previews are opened on demand, using the existing renderer.

No new environment variables are needed. House editing still requires ownership, recorded active membership and a fresh verification using that broadcaster's Subscriber Housing OAuth grant. A dashboard card may say active while a save fails if the broadcaster's eight-hour session has expired or verification is unavailable. Expired memberships retain their houses as read-only. No entitlement rules changed.

Manual verification in Chrome (no automated browser test was performed):

1. Stop any existing local server, then run `npm run build` and `npm start` from `F:\Development\TwitchLivingTown`. Keep the existing server-only environment configuration; do not paste credentials into URLs or logs.
2. In a signed-out/incognito window, open `http://localhost:3000/dashboard`. Expect the account page without private town or house information. Connect with Twitch; after success expect `/dashboard`. Denying authorization should leave the existing error on `/account`.
3. Open `/dashboard` directly while signed in. Check the appropriate states using available test accounts: neither role (Create My Town + no houses), town only, houses only, and both. Nothing is created merely by viewing the dashboard.
4. For an owner, open Manage My Town, Town & Mayor settings, and Configure OBS. Confirm the original controls and saved values load at `/dashboard/town`. Viewing OBS settings must not rotate its URL. The original live Town Overview remains at `/`.
5. For a user with houses in different towns, check each card's town and broadcaster, open its preview, Visit Town, and Customize House. The URL must contain that card's town ID and, for editing, its house ID. A retained legacy house offers View retained house. Only save a change if intentionally testing customization with an eligible test account.
6. Check `/my-houses`, the editor's Dashboard/Visit Town links, and `/account`. At a narrow mobile viewport, verify navigation/cards wrap and previews fit. On a visit page, test pan/zoom and confirm it stays in the selected town.
7. Click Sign out on the dashboard. Expect `/account?auth=signed_out`. Reload `/dashboard`; it should require login. With `AUTH_STORAGE=supabase`, restarting the local server must not revive the logged-out cookie/session. Existing automated tests exercise this with a disposable database.
8. An explicit `/api/auth/twitch/login?returnTo=https%3A%2F%2Fexample.com` should return the existing forbidden error on `/account`, never redirect externally. Normal Connect with Twitch still works.

Prompt 012 remains development-only; use its instructions below for the isolated OBS preview. No migration, live database modification, production OBS change, browser automation, commit or deployment is part of Prompt 015.

Validation: TypeScript, lint, all 197 tests, production build and Git diff checks passed. Tests include server-rendered dashboard states and use synthetic Twitch services/disposable PGlite databases. Chrome/OBS visual verification remains manual.

<details>
<summary>Prompt 015 file map</summary>

Created:

- Routes: `src/app/dashboard/error.tsx`, `src/app/dashboard/town/page.tsx`, `src/app/towns/[townId]/page.tsx`, `src/app/towns/[townId]/loading.tsx`.
- Components: `src/components/account-dashboard.tsx`, `property-cards.tsx`, `property-preview.tsx`.
- Read models/helpers: `src/lib/persistence/dashboard.ts`, `public-view.ts`; `src/lib/houses/attribution.ts`, `links.ts`.

Modified:

- Routes/styles: `src/app/dashboard/page.tsx`, `dashboard/loading.tsx`, `account/page.tsx`, `my-houses/page.tsx`, `my-houses/[townId]/[houseId]/page.tsx`, `globals.css`.
- Components: `src/components/my-houses.tsx`, `streamer-page.tsx`, `streamer-workspace.tsx`, `twitch-account.tsx`; `demo-house-editor.tsx` supplies the added property-view field without changing demo behavior.
- Services: `src/lib/auth/http.ts`, `service.ts`; `src/lib/houses/customization.ts`, `http.ts`; `src/lib/persistence/service.ts`, `streamer-access.ts`.
- Tests: `src/lib/auth/http.test.ts`, `diagnostics.test.ts`; `src/lib/persistence/persistence.test.ts`.
- Documentation: `README.md`, `PROJECT_SPEC.md`, `TASKS.md`, `DECISIONS.md`, `MULTI_TOWN_AUDIT.md` (follow-up note).

</details>

### Expanded OBS preview (Prompt 012, local development only)

This separate in-memory preview is at **http://localhost:3000/demo/obs-preview**. It does not fetch an account, saved world, Twitch events or OBS grant. No preview API or persistence path exists. Its fictional Mochi and neighbors are independent of your configured live Mayor/town. The existing real OBS URLs and authorization are unchanged.

Stop the local server before switching modes. In a dedicated PowerShell terminal, set process-only overrides (do not replace `.env.local`):

```powershell
cd F:\Development\TwitchLivingTown
$env:TOWN_DEMO_MODE = "true"
$env:PUBLIC_DEPLOYMENT = "false"
$env:AUTH_STORAGE = "memory"
npm.cmd run dev -- --hostname 127.0.0.1
```

Open the URL using `localhost`. Bind only to loopback; do not expose this development server through a tunnel or public host. Explicit `TOWN_DEMO_MODE=true` is required even in development. Public mode and all production builds (`npm run build` / `npm start`) deny this route regardless of the demo flag. This stricter gate applies only to the expanded OBS preview; older demo gates remain unchanged. Restart after changing flags. Using memory auth prevents this isolated process from claiming production's durable auth writer; it may require a fresh local login when returning to your town.

Select **25, 50, 100 or 200** total houses, enter an integer seed, then click **Apply Preview**. Counts replace the previous total rather than adding to it. The status line shows current house, district and plot counts; the scene always displays **DEMO / SIMULATED DATA**. Same count/seed produces the same geometry, fictional owners and exteriors.

Use **Presentation** to switch instantly between Living Town (automatic neighborhood camera following Mochi) and Mayor Spotlight (foreground Mayor and cropped background). Spotlight offers background pan/zoom/recenter buttons in the control view. Existing production camera behavior is untouched. Click **Open OBS capture view** and copy that tab's complete URL into an OBS Browser Source at 1920×1080. Example:

```text
http://localhost:3000/demo/obs-preview?capture=1&count=200&seed=42&mode=living-town
http://localhost:3000/demo/obs-preview?capture=1&count=200&seed=42&mode=spotlight
```

The capture view omits controls but retains the demo label/counts. No key or Twitch login is needed. For another count/mode, apply it in the control view and open/copy the new capture URL. Existing capture windows do not receive changes from other tabs. Custom camera adjustments are local to the control view; capture uses standard OBS framing.

**Reset Preview · return to my town** leaves the preview, destroys its renderer/timer and opens `/`. The existing Town Overview loads the actual saved town when signed in; select/reload it there if needed. No saved layout, house customization, Mayor setting or subscriber record was edited. If using an isolated memory-auth session, sign in again to load your saved town. To return to your normal environment, stop the server and close this dedicated terminal (or remove these three process overrides), then start your usual server. Do not enable durable auth against production while another instance owns it.

Refreshing the control page resets to its URL/default 25-house preview; refreshing a capture URL reconstructs its deterministic simulated scene. Nothing is stored in localStorage or a database. Each applied world is generated once per scene lifecycle; animation ticks retain geometry, mode switches reuse GPU resources, and actors remain capped at 24. A 200-house apply can briefly occupy the main thread. No FPS claim or automated browser/WebGL benchmark was made; manually check both modes in Chrome/OBS, repeated count switches, labels and cleanup at your capture resolution.

Validation for this milestone: lint, TypeScript, all 190 tests, production build and Git whitespace checks passed. A temporary production server with real credentials disabled returned 404 for control/capture previews even with the demo flag true; it was stopped after the direct HTTP checks. Existing expansion and production OBS authorization tests remain passing.

### Run the main application

Use Node.js 22 or newer and npm. From PowerShell:

```powershell
cd F:\Development\TwitchLivingTown
npm install
npm run dev
```

Open **http://localhost:3000**. If PowerShell blocks `npm.ps1`, use `npm.cmd` in the same commands. On subsequent checkouts, `npm ci` installs the exact lockfile versions.

The town and simulator need no credentials. For Twitch account connection, configure the server variables below. If `.env.local` already exists, edit it without replacing your existing values. `NEXT_PUBLIC_*` values are public and must never contain secrets.

## Connect Twitch locally

The registered Twitch developer application is **Living Town**. Set these variables in the ignored `.env.local` at the repository root:

| Variable | Value |
| --- | --- |
| `TWITCH_CLIENT_ID` | Your registered application's client ID |
| `TWITCH_CLIENT_SECRET` | Your registered application's client secret |
| `TWITCH_REDIRECT_URI` | `http://localhost:3000/api/auth/twitch/callback` exactly |
| `SESSION_SECRET` | A random 32-byte secret encoded as standard base64 (44 characters) or hexadecimal (64 characters) |

Generate the session secret locally, then paste the output into `SESSION_SECRET` in `.env.local`. Do not share the output or commit it:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Restart `npm run dev` after configuring environment variables. Use **http://localhost:3000**, not `127.0.0.1` or another port: the origin and callback must match the registered redirect. Basic login requests no extra scopes. **Authorize Twitch Chat** requests `user:read:chat`; **Authorize Subscriber Housing** requests `channel:read:subscriptions`. Either upgrade retains the other permission if previously granted. No posting, moderation, subscription-management, follower or email permissions are requested.

### Manual login checklist (Chrome)

1. Open the Town Overview and select **Connect with Twitch**. Confirm Twitch shows the **Living Town** application and approve it. The callback redirects to `/account` with your display name, profile picture (when available), login and stable Twitch user ID.
2. Follow **Back to the Town Overview**. Your account appears in the header. Test Mayor movement, camera pan/zoom, regeneration and the event simulator using the existing checklist below. Login assigns no town, house or subscription status; simulation identities remain synthetic.
3. Reload `/account`: you should remain signed in. `/api/auth/session` returns only public profile fields and a logout CSRF value, never OAuth tokens. In Chrome Application → Cookies, `living-town-session` should be opaque, HttpOnly, SameSite=Lax and scoped to `/`. It is deliberately not Secure on local HTTP; production uses Secure `__Host-` cookies.
4. Select **Sign out**: the account disappears and `/api/auth/session` shows `user: null`. This signs out of Living Town, not Twitch's own website.
5. Start another login and cancel at Twitch. A safe cancellation message should appear. Visiting `/api/auth/twitch/callback` without parameters should report an unverifiable attempt; start again via the button. A callback URL can be used only once; do not share or save its code/state.
6. To check revocation, connect, then remove Living Town in your Twitch connections settings. The server detects revocation at its next validation (normally within 31 minutes), and the account UI refreshes on window focus or every five minutes. Restarting clears sessions in the default local memory mode. Supabase auth mode restores unexpired sessions and validates them again. An idle session expires absolutely after eight hours.

Automated tests use synthetic credentials and mocked Twitch responses. A real Twitch login and browser interaction testing are intentionally left to you.

### Safe OAuth diagnostics

The server emits structured `twitch_auth` records with an operation, start/success/failure outcome, safe category, optional HTTP status and a fixed Twitch endpoint label. It never logs OAuth codes/state, token values, cookies, client/session secrets, request/response bodies, exception text/stacks or callback query strings. Normal Next callback access logging stays suppressed.

For a failed login, fully stop the development server and restart `npm run dev` so retained auth instances load the latest diagnostic code. Start a **new** Connect with Twitch attempt; do not refresh/reuse an OAuth callback. A successful trace reaches `login_redirect`, `token_exchange`, `token_validation`, `profile`, then `callback_session` success. Chat upgrades add a granted-scope/account check; basic login requests no chat scope.

- `login_configuration`, `login_state`, or `login_redirect` failures happen before the browser reaches Twitch; the login route's 303 alone does not prove successful authorization redirection.
- `callback_state`/`callback_session` with `state` means missing, expired, mismatched or consumed state. No Twitch request is necessary to produce this failure.
- `token_exchange`, `token_validation`, or `profile` with `dns`, `tls`, `connection`, `timeout` or `aborted` identifies the failing network operation. `http_error` includes only the HTTP status; a 400 exchange rejection becomes the safe `code` error, not proof of a network outage.
- `token_scope_validation` means the validate response contained malformed non-null scopes (for example a string or a mixed-type array). Null/omitted scopes normalize to an empty list for basic login; chat still requires explicit `user:read:chat`. Client/user identity and expiry checks remain mandatory.
- `identity_validation`, `chat_permission`, or `session_creation` identifies a local check/storage failure. `type_error` and `unexpected_error` indicate an unclassified exception, not confirmed external connectivity failure.

Known AuthError categories are recognized by their allowlisted name/code across separate Next route bundles and hot reloads. A cached service's error must not be mislabeled as a Twitch outage merely because its constructor differs from the current handler's constructor. Diagnostic records can be shared for troubleshooting; do not share full callback URLs, browser cookies or credentials. A complete real OAuth round trip still requires manual browser verification.

### Session storage and deployment

Logout uses a fixed same-origin fetch with browser-generated Origin, session-bound CSRF and HttpOnly cookies. The global `Referrer-Policy: no-referrer` remains enabled: native form navigation can send `Origin: null` under that policy, which the server rejects before touching the session. The fetch explicitly uses CORS mode with same-origin credentials and rejects redirects; this does not enable cross-origin access. Only confirmed JSON success navigates to the signed-out page. Missing/null/foreign origins remain rejected. See the [Fetch Origin algorithm](https://fetch.spec.whatwg.org/#append-a-request-origin-header).

To verify Prompt 011C in Chrome: stop the old server, run `npm run build` and `npm start`, then reload `http://localhost:3000/account`. With `AUTH_STORAGE=supabase` and migration 006 already manually applied, sign in if necessary. In DevTools Network, enable Preserve log and click Sign out. Expect POST `/api/auth/logout`, `Origin: http://localhost:3000`, mode `cors`, HTTP 200 and `{"signedOut":true}`, followed by navigation to `/account?auth=signed_out`. The response expires the Secure/HttpOnly `__Host-living-town-session` cookie; Application → Cookies should show it removed. `/api/auth/session` must return `user:null`. Restart `npm start` and reload: remain signed out. Also test signing in, restarting while signed in, and then signing out. Do not share cookie, CSRF or callback values. A prior 403 caused by null Origin did not revoke the session; normal expiry or independent revocation can still change its later state.

Auth requires **one continuously running Node process**. Opaque 256-bit cookie IDs refer to server records; only HMAC digests of IDs are stored. Access/refresh tokens are AES-256-GCM encrypted using keys derived from `SESSION_SECRET`. Localhost defaults to `AUTH_STORAGE=memory`. Public production requires `AUTH_STORAGE=supabase`, which saves sessions and encrypted revocation work through private RPCs from migration 006. OAuth state remains browser-bound, memory-only, single-use and expires after ten minutes. No credentials or tokens enter browser storage, client bundles or public session responses. Tokens are held transiently in plaintext only while making server-side Twitch requests.

Validation runs on login, startup re-entry, stale session reads, and a background timer every minute with a 30-minute freshness threshold, inside Twitch's hourly requirement. The owner guard forces fresh validation. Expired tokens are refreshed after Twitch rejects them, with rotated refresh tokens retained; unexpected revocation or unverifiable identity ends affected sessions. A temporary validation outage denies access without erasing credentials or the browser cookie; a successful validation is required before access resumes. Sign-out persists session deletion before reporting success and attempts revocation; encrypted pending revocations retry for up to an hour, including after a restart in durable mode.

In durable mode, keep the same `SESSION_SECRET` across restarts. A new process restores unexpired sessions and fences previous auth writers. Do not run replicas, cluster mode, or local/staging durable-auth processes against production storage. Interrupted OAuth attempts must be restarted, and EventSub connections must be manually reconnected; saved sessions do not automatically recreate sockets. The prototype caps active sessions at 200 and pending login attempts at 1,000. Town mutations check authenticated ownership against the trusted repository; login alone grants no administration rights. Follow the recovery procedure in [DEPLOYMENT.md](DEPLOYMENT.md).

For publicly deployed production authentication, register an **HTTPS** callback and configure `TWITCH_REDIRECT_URI` accordingly. The exact `localhost` hostname is the only HTTP exception, including under `npm start`: the registered `http://localhost:3000/api/auth/twitch/callback` works for local production testing in Chrome. Production still uses Secure, HttpOnly, SameSite=Lax `__Host-` cookies; Chrome supports Secure cookies on localhost ([cookie documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)). Do not substitute a LAN address, `127.0.0.1`, a localhost subdomain or a public HTTP host. Changing server configuration requires a full process restart. Memory-mode sessions are lost; durable sessions survive with the same session secret and Twitch application configuration. Keep reverse-proxy/hosting access logs from recording callback query strings, authorization headers or token bodies. Next development callback request logging is suppressed in `next.config.ts`; infrastructure logging is configured separately.

Production-local verification: stop the previous server, run `npm run build` then `npm start`, and open `http://localhost:3000/api/auth/session` in Chrome. Expect HTTP 200 and `configured: true` (signed-out `user: null` is normal). Open `/account`, connect with Twitch, then reload and verify you remain signed in. Under Application → Cookies, confirm `__Host-living-town-session` is Secure, HttpOnly, SameSite=Lax, Path `/`, with no Domain. Test sign-out. Do not share callback URLs, cookie values or CSRF values. The earlier production-only failure was callback validation rejecting HTTP localhost, not missing environment variables or build-time secret caching; no environment or Twitch app change is needed for this correction.

## Connect real Twitch chat (Prompt 004)

No additional environment variables, webhook tunnel, worker command or dependencies are needed. EventSub runs on the server in the same continuously running Node process as the auth service (memory locally, Supabase-backed in public production). **Fully restart the development server after upgrading this code**, then use `npm run dev`. Hot reloads reuse a process-wide connection manager rather than creating duplicate sockets; restart after changing auth/connection internals so retained instances load the new code.

1. Sign in to **Living Town** with the Twitch account whose own channel you want to connect. Return to the Town Overview. Existing basic sessions show **Chat permission: not granted**.
2. In the **Twitch chat** panel, select **Authorize Twitch Chat** and approve `user:read:chat` for that same account. Declining keeps chat disconnected; switching accounts during this authorization is rejected. Successful authorization returns to the town with **Chat permission: authorized**.
3. Select **Connect Chat**. Wait for **WebSocket: connected** and **Chat subscription: ready (channel.chat.message)**. Readiness requires the successful subscription response, not just the socket welcome. **LIVE SOURCE** identifies the selected town view; it does not promise a working subscription. On a second tab, select **View live town**; tabs share one Twitch connection.
4. Open the connected channel's Twitch chat and send an ordinary message (you or another chatter can send it). Within roughly one second plus network latency, **Last event** and the message count update. The activity meter rises and the Mayor/ambient townspeople become more active. Ordinary chat creates no resident, follower, subscriber or house records.
5. Try messages from several people to reach a higher activity level. One user earns credit at most every ten seconds, and repeated normalized text from that user earns no new credit during the 60-second window. Message count includes valid unique messages even when spam controls award no activity. Stop chatting: the meter fades to peaceful within 60 seconds.
6. Pan/zoom while receiving messages: the camera stays put. **View simulated town** exposes the original development simulator; its events never affect the live feed or saved town. Switch back using **View live town**. Switching sources resets the camera for that different town. Regenerate changes only the demo/unsaved preview; it is disabled for saved layouts. It does not disconnect Twitch or erase the server's recent chat activity.
7. **Disconnect Chat** stops the shared connection for your channel. **Connect/Reconnect Chat** restarts it. Brief socket/network failures reconnect automatically with backoff; Twitch-directed reconnects transfer the subscription. Closing all tabs does not disconnect until sign-out/session expiry or an explicit disconnect. Sign-out or Twitch revocation closes the connection; reconnect your account and authorize chat again when needed.

Live source is a personal channel preview, not ownership of any other town. Only the signed-in channel can be selected; no browser-supplied broadcaster ID is accepted. Start/stop/authorize controls require the session, same-origin POST and CSRF. Status requires authentication and is never publicly cached. This phase does not expose a public live town directory or administration API.

The server maps Twitch message IDs into the existing `CHAT_MESSAGE` processor and namespaces towns by broadcaster ID. Readable message text is used only transiently for validation/normalization, then replaced with a keyed fingerprint for the existing repeated-text rule. Fingerprints and chatter IDs expire with the 60-second activity window. The browser receives only activity sample ages, channel identity, status, count and last-event time—not chat text, chatter IDs, credentials or tokens. Live delivery IDs are retained for ten minutes (up to 10,000); the live outcome ledger is capped at 1,000 and activity samples at 2,000. Events older than ten minutes are ignored; full dedup capacity drops new events until space expires. The development simulator retains its existing synthetic ledger behavior.

Limitations: sessions, connections and live activity are in memory; restart signs users out and requires reconnecting. At most 100 channel entries are maintained; inactive entries expire after ten minutes without status requests. This is for one long-running Node process, not serverless/Edge or multiple replicas. Moving to a worker or multi-streamer deployment will require shared encrypted auth storage, connection ownership/leases, distributed deduplication, validation scheduling and durable town ownership. Twitch does not replay messages lost during an ordinary disconnect. Browser updates currently use one-second authenticated polling; there is no Socket.IO or public event-writing endpoint. Public production deployments require HTTPS OAuth configuration; exact localhost HTTP is supported for local production testing.

Protocol references: [EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [channel.chat.message authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage), and [Create EventSub Subscription](https://dev.twitch.tv/docs/api/reference/#create-eventsub-subscription).

### Diagnose missing chat (Prompt 004C)

With `npm run dev`, server-only JSON records tagged `twitch_chat` trace socket open/welcome, keepalives, subscription creation/readiness, reconnect/revocation and notification processing. These chat diagnostics are disabled outside development. They contain fixed operation/reason labels, safe error categories, numeric HTTP/close codes and boolean checks; they never include chat text, message/subscription/session IDs, credentials, cookies, response bodies, exception text or reconnect URLs.

After a full server restart, reconnect your account and chat. A successful `subscription_create` record has `httpStatus: 202`, with `subscriptionIdPresent`, `enabled`, `chatEvent`, `websocket`, `broadcasterMatches`, `userMatches` and `sessionMatches` all true. This confirms the subscription ID exists, status is enabled, event is `channel.chat.message` v1, transport is WebSocket, both conditions match the signed-in channel and the transport matches the welcomed socket. `subscription_ready / success` follows. Periodic `keepalive / received` records confirm continued socket traffic when chat is idle.

Send a new ordinary message in the exact channel displayed by Living Town, including from the broadcaster's own account. Expect `notification / received`, then `event_processor / accepted`, an increased `receivedMessages`, and a UI update within roughly one second. `activityAwarded: false` means a valid message counted but the existing rapid/repeated-message rules awarded no additional activity. Use different text at least ten seconds apart to earn activity again; activity fades over sixty seconds.

- `notification / rejected` identifies the mapping/transport check that blocked delivery: for example `invalid_message_id`, `channel_mismatch`, `session_mismatch`, or an invalid/stale/future timestamp.
- `event_processor / ignored` with `duplicate_message` means an already-counted Twitch message was delivered again; `dedup_capacity` means the bounded dedup window is full.
- `subscription_pending` means a notification arrived before the subscription HTTP response. Up to 100 frames wait briefly in memory and are checked against the confirmed subscription before processing. Failure, timeout or disconnect discards that queue; overflow is logged as `pending_capacity`.
- `subscription_create / failure` identifies the fixed Helix endpoint and safe HTTP/error category. `socket / failure` or `/ closed` identifies watchdog, connection or close-code failures without exposing sensitive URLs.
- If keepalives continue with no `notification / received`, no chat notification has reached this process. Confirm the selected channel and that the message actually appears in Twitch chat. Do not infer an event-processor failure from a zero counter alone.

The reported failure was localized to `invalid_message_id`. Twitch message identifiers are opaque strings; the previous URL-safe character whitelist rejected live notifications before simulation processing. Delivery/chat IDs now retain their exact value, accept punctuation, and still reject missing, blank, non-string, control-containing or oversized values (4,096 characters). Deduplication uses the chat message ID, not the delivery ID, so retries cannot double-count. Subscription/session checks and numeric Twitch account checks remain unchanged. The manual retest's server trace confirmed HTTP 202 with all subscription checks passing, four accepted messages and a subsequent keepalive. Only share these structured diagnostic records when troubleshooting, never raw frames or secrets.

## Persistent towns with Supabase (Prompt 005)

Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the existing ignored `.env.local`. Use the project's `https://...supabase.co` URL and a server secret API key beginning `sb_secret_`, never a publishable/anon key or `NEXT_PUBLIC_` variable. No changes to Twitch secrets or scopes are required.

**Review and manually apply [202610280001_persistent_towns.sql](supabase/migrations/202610280001_persistent_towns.sql)** once in the intended project's Supabase SQL Editor. Follow [database setup and security instructions](supabase/README.md), including the safe SQL privilege check. No migration is run against your live database automatically.

Manual verification:

1. Fully restart `npm run dev`, open `http://localhost:3000` and sign in using Twitch. Return to the town. **Your town** performs a database read; login or a page visit does not create a town.
2. Select **Reload saved town**. If no town exists, the panel offers **Create my town**, confirming the migration and database API are reachable. The authenticated `GET /api/town` should return HTTP 200 with `storage: "supabase"`, `town: null`. Missing configuration/schema or an outage returns a clear error. The labeled demo remains available; no production save falls back to memory.
3. Follow **Create my town** into the onboarding wizard: choose a town name, Mayor look/name and personality, review, then explicitly create. You arrive at the Streamer Dashboard. Twelve unclaimed starter houses are scenery, not proof of subscribers. Repeated creation requests return the same town.
4. In **My town → Streamer Dashboard**, edit the town or Mayor and select **Save settings**. Reload the page, navigate through `/account`, then restart the Node server and sign in again. The town UUID, seed, buildings, plot coordinates and settings must remain the same. OAuth sessions and temporary chat activity reset on server restart.
5. Authorize/connect chat as before. Send a message and confirm the activity meter/counter and Mayor movement. In Supabase, the town revision and processed-event row count should **not** change because of chat, movement or polling.
6. Select **View simulated town**, run subscribers/gifts/raids, regenerate or reset the demo. Return to **View live town**: the saved town is unchanged. Regeneration is intentionally disabled while viewing a saved town. Check existing camera pan/zoom and Mayor animation manually.
7. Sign in with another Twitch account (for simultaneous testing use a separate Chrome profile). It has no town until deliberately created, and gets an independent UUID/layout. It cannot update the first account's town. A viewer can own a separate town without gaining access to anyone else's town.
8. Optional: the authenticated `/api/town` response exposes your town UUID. `GET /api/towns/<UUID>` returns its public visual projection, with no residents, owner IDs, subscriptions, gifts or private customization data. Do not share the private `/api/town` response or CSRF token.
9. To test missing configuration, temporarily unset `SUPABASE_SECRET_KEY` locally, restart and try loading. Expect an explicit configuration error. Restore the setting and restart; the real town must load again. Database/network failure and rollback cases are covered offline by the automated tests; no failure creates a replacement town in memory.

Durable writes reuse the existing processor with transaction locks, revision checks, foreign keys and unique event/plot/owner constraints. Tests use disposable embedded PostgreSQL with synthetic identities; no live subscriber ownership is fabricated. Prompt 006 connects verified subscriptions to these APIs; Prompts 007/008 add customization and incremental neighborhoods. All `living_town_*` tables are RLS-enabled and inaccessible to browser roles. Twitch sessions are authorized by Next.js; Supabase Auth is not used, and RLS does not authorize the secret-key server on behalf of a Twitch user.

Town persistence is production-shaped but auth/EventSub still require one long-running Node process. See [limits and deployment follow-up](supabase/README.md). The original labeled local demo remains the development fallback; it is never saved into a real town.

## Subscriber Housing (Prompt 006)

No new environment variables or dependencies are required. Keep the six existing server variables configured. Review and manually apply **[202610280002_subscriber_housing.sql](supabase/migrations/202610280002_subscriber_housing.sql)** after migration 001, as described in [database setup](supabase/README.md). It adds verified tier/gift/evidence fields, inactive subscription evidence, and a private last-sync projection; it preserves existing towns and house identities. Do not rerun migration 001 on an existing database. Nothing applies migrations automatically.

### Manual verification in Chrome

1. Fully stop and restart `npm run dev` after applying migration 002. Sign in as the broadcaster and load/create **your own saved town**. Open **Subscriber Housing** below the Overview. Existing basic/chat sessions need the new permission.
2. Select **Authorize Subscriber Housing**, approve `channel:read:subscriptions` for the same broadcaster account, and return to the town. Previously granted chat permission must remain authorized. Switching accounts or omitting a requested scope rejects the upgrade. Reconnect Chat after reauthorization because the session rotates.
3. Select **Sync Subscribers**. The panel polls every five seconds: expect `running`, then `complete`, with imported/updated/unchanged/waitlisted/failed counts and a timestamp. Reload after completion; housing, owners and layout must remain saved. Sync again: existing memberships are unchanged, and houses/plots/customization are retained. Waitlisted is a subset of processed subscribers, not an additional import count. An unchanged subscriber may still refresh evidence/revision.
4. Select **Connect subscription events**. Wait for **ready (4 subscriptions)**. This requires successful API confirmation of all four subscriptions, not just a WebSocket welcome. If chat is connected, both use the same socket; enabling/disabling either feature restarts the socket for the remaining subscriptions. Keep the server running. On restart or reauthorization, reconnect explicitly and synchronize to recover current membership.
5. On an eligible channel, use a genuine subscription or gift if one occurs naturally. Individual verified recipients receive homes; the gifter receives no house merely for gifting. A gift batch triggers one gift celebration, and an API sync resolves current recipient identities. Anonymous gifts create no fake resident. Subscriber homes refresh within roughly five seconds plus network/database time. Choose **View live town** if currently viewing the demo. Existing arrival/Mayor effects are transient, so keep the town open to observe them.
6. A resub message preserves the existing house and records available cumulative months only after an API entitlement check. A `channel.subscription.end` event makes the house **legacy** without deleting it; renewal restores active status on that same property. To check a natural expiration later, synchronize; only a complete list followed by a separate negative user lookup can mark an absent member inactive. Cancellation of automatic renewal is not necessarily subscription expiry.
7. Check camera pan/zoom, Mayor movement, real chat counts and the separate event simulator. No simulated event reaches Supabase. After server restart, sign in and reload: all saved housing remains.
8. For the identity foundation, sign in as a verified subscriber in a separate Chrome profile and open `/api/subscribers/house?townId=<saved-town-UUID>`. It returns that authenticated user's own house (including a retained legacy home) or `null`. Supplying a username/user ID does not select another owner. This is a read-only foundation, not a customization portal or proof of current entitlement.

### Channels without subscription access and failure behavior

Run `npm test`: synthetic Twitch responses and disposable PostgreSQL cover imports, pagination, scopes/channel ownership, gifts/anonymous gifts, duplicates, resubscriptions, cancellations, fixed plots/waitlisting, CSRF, own-house lookup and database failure/retry. Tests use neither `.env.local` nor a live Twitch/Supabase connection. The existing simulator remains a visual demonstration only; it cannot populate real subscriber housing. No Affiliate/Partner status, purchases, bot secrets or live events are required for these tests.

If Twitch denies subscriber access, the panel reports unsupported/unavailable access or a permission error. A valid empty API list can instead complete with zero imports. An incomplete or failed sync is never labeled complete, and it never deletes homes. Imported records before a later-page failure remain saved. A run interrupted by process restart is displayed as partial; retry sync. Revoked/expired sessions require reconnection. `twitch_housing` diagnostics contain only operations, outcomes and safe categories/status codes, never chat text, tokens, identities or sensitive URLs.

Live events implemented: `channel.subscribe`, `channel.subscription.end`, `channel.subscription.gift`, and `channel.subscription.message`, all version 1. They reuse the existing verified socket lifecycle and transaction processor. Temporary failed deliveries retry up to eight attempts in a bounded process-memory queue; an outage/restart can still lose events. Sync recovers current membership, not missed historical gift totals or celebrations. Twitch exposes no shared gift-batch/recipient correlation key, so batch counts and recipient ownership are reconciled separately without guessing exact membership. Repeated API/recipient events cannot create extra properties or count extra gift batches.

Towns start with **14 permanent property slots** and now expand automatically (Prompt 008 below). Legacy homes remain occupied; they are not reassigned to other users. Deferred allocations retain verified subscribers on the waitlist. Durable event queues, distributed workers and retention jobs remain future work. The exterior editor is implemented in Prompt 007. Sync has safety limits of 100 records/page, 500 pages, 10,000 distinct users and ten minutes; reaching a limit reports partial progress.

References: [Get Broadcaster Subscriptions](https://dev.twitch.tv/docs/api/reference/#get-broadcaster-subscriptions) and [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/).

## My Houses and exterior customization (Prompt 007)

**No new environment variables or Twitch scopes.** Review and manually apply [migration 003](supabase/migrations/202610280003_house_portal.sql) after 001 and 002. It adds one server-only indexed lookup for the towns in which a Twitch user owns a property; it changes no existing rows or ownership rules. Existing appearance/customization fields and transactional commits hold all edits. Never rerun 001/002 or apply migrations automatically.

### Try the demo with zero subscribers

1. Run `npm run dev` from `F:\Development\TwitchLivingTown`.
2. Open **http://localhost:3000/demo/house-editor**. No login, Supabase configuration or actual subscriber is needed.
3. Change the name, roof/wall/door/fence presets, garden and finishing touch. The enlarged PixiJS cottage updates immediately; the separate demo town below remains unchanged.
4. Use **Reset to Saved** to discard the draft. Change it again and select **Apply to demo town**. The first cottage in the upper-left residential block updates in that demo town. Pan/zoom to inspect it.
5. Reload: the sample resets. No user, resident, verified membership or property is created in Supabase. The main town/simulator are separate.

The route is unavailable in a normal production build. For an explicitly authorized presentation, set `TOWN_DEMO_MODE=true` **before** `npm run build`; this enables both the existing simulator and demo editor. Rebuild with it false to disable. Demo editing never gains access to a persistence endpoint.

### Test a verified property

1. Apply migration 003 manually and fully restart `npm run dev`. In one Chrome profile, sign in as the streamer, authorize Subscriber Housing and sync a genuine subscriber. Keep the streamer signed in to this same Node process.
2. In a different Chrome profile, sign in as that subscriber using basic Twitch login. Open **http://localhost:3000/my-houses** (also available through **My Houses** beside the account controls). Homes across all participating towns appear here; no username claim or new viewer scope is required.
3. Open a property at `/my-houses/<town-UUID>/<house-ID>`. Active verified properties offer editing; legacy/inactive/unverified properties remain read-only. House size/prestige are shown but cannot be edited.
4. Change presets and name; confirm **Unsaved changes**. **Save house** validates the viewer, ownership, stored eligibility and current membership through the existing broadcaster-scoped Helix lookup. If the streamer has no usable authorized session, Twitch is unavailable or membership has ended, saving is denied without changing the house. Reconnect the streamer's account/authorization and retry after reloading.
5. After success, reload the editor and check the saved values. In the streamer's profile, reload the Town Overview or **Reload saved town**. Colors, name, garden and finishing touch must match; placement/ownership/size/prestige remain unchanged. Restarting the server preserves the saved house, although fresh logins are needed to edit again.
6. Open the same property in two tabs, save in one, then attempt a stale save in the other. Expect a conflict; **Reload saved house** explicitly discards the draft after confirmation. A simultaneous sync/Mayor update can also cause a revision conflict; no automatic overwrite occurs.

Membership rules are unchanged: login never proves entitlement, and the API verifies the subscriber's stable ID against the property's actual broadcaster. The existing broadcaster's `channel:read:subscriptions` grant is reused. Since OAuth sessions are process-local, a streamer must be signed in and authorized for fresh save-time verification. Stored appearance is viewable even when fresh verification is unavailable.

House names allow up to 40 letters/numbers/spaces/apostrophes/periods/hyphens and are public visual data. Uploads, arbitrary colors, inventory and protected metadata changes are not supported. Unrelated customization metadata is preserved. Reload is the reliable way to see another tab's edits. No server-side draft storage, shared sessions or extra EventSub types were added.

`npm test` covers ownership, multiple-town lookup, legacy restrictions, strict input rejection, fresh membership failure, durable save/reload, concurrent expiry, demo isolation and saved appearance projection. Fixtures never create real subscribers or connect to live Supabase/Twitch. GPU visuals and Chrome interactions remain manual.

## Town controls

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
4. **Gift 2 subscriptions**, then **Replay gift recipients:** the gift count and ownership remain unchanged on replay. The event log acknowledges the gifter. Two expansion plots are filled first; later owners receive existing unclaimed homes, followed by newly generated plots. Fewer than four available plots triggers a new neighborhood.
5. **Chat burst:** eight sample people raise activity and ambient movement. Repeatedly press **Repeated chat**: the same text/user earns no additional activity during the window. With no chat, the score fades to peaceful within 60 seconds.
6. **Incoming raid:** Town Hall welcomes 25 temporary visitors for 20 seconds; house/resident counts stay unchanged.
7. **Reset demo town:** clear events, owners, residents and activity while keeping the seed. **Regenerate town** also changes the seed. Reload restores the starter demo.

Production builds hide the simulator by default. For an isolated local demo with `PUBLIC_DEPLOYMENT=false`, set `TOWN_DEMO_MODE=true` in the build environment before `npm run build`. Rebuild with it unset or `false` to disable again. Setting it only at `npm start` does not change a previously prerendered page. This flag grants no backend privileges; there is no event mutation endpoint.

The browser needs WebGL and hardware acceleration. A loading state and retryable error message cover renderer startup failures. Town artwork uses local procedural graphics or inline SVG, with no art downloads or external font requests. Signed-in profile pictures load from Twitch's image CDN.

## Checks and production

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production build at http://localhost:3000 (the exact localhost HTTP exception supports local authentication; public deployments require HTTPS). Stop a running server with Ctrl+C before starting another on that port. `typecheck` generates Next.js route types before checking TypeScript. Tests cover generation, simulation, OAuth state/callback failures, session cookies and encryption, expiry, validation/refresh/revocation, and tenant ownership guards. No automated unit tests contact Twitch or read local credentials.

Tests include all four migrations in disposable PostgreSQL, concurrent allocation/rollback/RLS, subscriber imports, housing/customization lifecycle, mocked EventSub, auth, town generation and live/demo separation. Expansion tests include 360 and 495 logical subscribers, connected paths, stable properties, camera bounds, and a mid-projection database failure. They do not read credentials or contact Twitch/Supabase. Applying outstanding migrations to your Supabase project and browser interaction checks remain manual; no browser automation is performed. See TASKS.md for validation results.

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
src/lib/simulation/repository.ts    Isolated synchronous demo/test repository
src/lib/simulation/config.ts        Development/authorized-demo gate
src/components/event-simulator.tsx  Local simulated-event controls
src/components/twitch-account.tsx   Connect/sign-out controls and public profile
src/app/account/page.tsx            Account screen and safe auth feedback
src/app/api/auth/                   Login, callback, session and POST logout routes
src/lib/auth/                      OAuth client, encrypted memory/durable sessions, HTTP handlers, ownership guard and tests
src/lib/chat/                      EventSub lifecycle, mapping, shared manager, activity projection and tests
src/app/api/chat/                  Authenticated status and POST authorize/start/stop endpoints
src/components/chat-connection.tsx Connection panel and one-second activity polling
src/components/persistent-town.tsx Explicit town creation, reload and Mayor settings
src/lib/persistence/               Typed Supabase repository, authorization, validation, transactions and tests
src/app/api/town/                  Private own-town GET/create/Mayor update
src/app/api/towns/[townId]/         Public-safe visual projection
src/lib/subscribers/               Helix subscriber pages, verified event mapping, synchronization and delivery queue
src/app/api/subscribers/           Own-channel housing controls/status and authenticated own-house lookup
src/components/subscriber-housing.tsx Permission, sync, counts and live-event controls
supabase/migrations/               Reviewed versioned PostgreSQL migration
src/instrumentation.ts             Server startup validation/background lifecycle
```

The original spatial layout remains fixed. New districts append connected blocks with deterministic planting outside that original footprint. Runtime effects are not part of the saved-world shape. Deliberately created towns reload durable data from Supabase; local demos and temporary movement/activity remain in memory. Leaving the page can reset the demo, but it does not reset a saved town.

## Automatic neighborhoods (Prompt 008)

No new dependencies, environment variables or Twitch permissions. Review and manually apply **[202610290004_neighborhood_expansion.sql](supabase/migrations/202610290004_neighborhood_expansion.sql)** once, after migrations 001–003, using the same database administrator. Do not rerun earlier migrations. The new migration extends the existing transactional commit and adds a private growth-check helper; it regenerates no existing rows. An accidental full-file rerun fails at the existing helper and aborts the transaction. No live migration is applied by the application or tests.

Planning constants live in `src/lib/town/planning.ts`: reserve **4** available plots, **12** plots per new neighborhood. Allocation uses the two original empty lots, unclaimed starter homes, then new empty lots. Claiming the eleventh property in a fresh town leaves three available and appends the first district: **26 total plots, 15 available**. Expansion uses a square spiral of 1600 × 1120 world-unit blocks, stable IDs and a seed derived from town seed/district index. Roads link each block to the previous block. Core coordinates, old roads, ownership, customization and Mayor settings remain intact. Loading saved towns uses their stored geometry, never a new generation pass.

Growth and allocation share the existing row lock, revision retry and event receipt transaction. Repeated deliveries/syncs do not add duplicate properties. If an expansion transaction fails, a separate retry first reloads the town and preserves membership using existing capacity or a waitlist. Sync reports partial progress with `expansion_deferred`/capacity when applicable. Retry **Sync Subscribers** after fixing storage/migration issues; a new verified receipt retries allocation. Replaying an already committed event ID does not bypass deduplication. A complete storage outage cannot save even a waitlist record: the bounded process-local event queue retries, and a fresh sync reconciles membership after recovery. Restarting loses pending in-memory deliveries.

### Manual demo check — no database needed

1. Run `npm run dev` in this workspace and open http://localhost:3000 in Chrome. Select the **simulated** source and expand **Event simulator**.
2. From a reset demo, click **Fill existing capacity**. It adds 14 synthetic subscribers and grows to 26 total plots. The neighborhood announcement appears; original houses stay in place.
3. Click **Fit town** (⌗), or focus the canvas and press **0**. Pan/zoom into the new eastern district. Check connecting streets, houses and Mayor movement.
4. Click **Add 12 demo subscribers**, then **Add 48 demo subscribers** repeatedly. Neighborhoods grow around the original village. Fit Town frames all generated districts; zoom can still inspect individual houses.
5. **Retry last event ID** must not add a house, resident or district. **Reset demo town** restores the original 14 plots/12 showcase homes; **Regenerate town** changes the demo seed. Saved towns are untouched.

### Manual saved-town check

After manually applying 004, fully restart `npm run dev`, sign in as the broadcaster, reload your saved town, and connect/select the existing live source. Run **Sync Subscribers** with real verified members. Enough occupied properties to cross the reserve threshold must create a connected neighborhood and show a short announcement. Check active/available/waitlisted counts, then sync again: house IDs and layout must remain unchanged. Reload the page, reconnect if needed, and use Fit Town. Confirm a previously customized house and Mayor settings remain intact. Do not use synthetic accounts/events against production storage.

### Performance boundaries

The initial safety ceiling is **40 added neighborhoods / 494 plots**, aligned with schema/size limits. Overflow stays recorded on the waitlist; raising this ceiling requires reviewing coordinate, graph, snapshot and SQL limits together. The 360-subscriber logical test takes roughly two seconds on the development machine; it is not a GPU frame-rate guarantee. Tests also fill all 494 slots plus one waitlisted member. There is no unlimited-scaling claim.

At most 24 resident actors animate; paths use cached node maps. Offscreen homes, trees and district backgrounds are hidden. House-only changes reuse unchanged graphics and retain camera/actors; new districts rebuild static scenery. Roads/flowers remain a shared static layer, and Fit Town necessarily displays many objects. Sync still commits full snapshots and relational projections per subscriber (one extra summary read per page); batching, spatial streaming, durable jobs and browser performance profiling remain future work. Visual checks remain manual.

## Stack

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, ESLint and PixiJS 8. Exact versions are captured in `package-lock.json`. The application is initialized directly in the repository root.

See [PROJECT_SPEC.md](PROJECT_SPEC.md), [TASKS.md](TASKS.md) and [DECISIONS.md](DECISIONS.md) for the roadmap and architecture. Twitch events beyond chat/subscriptions, distributed realtime services and advanced management tools are deferred. OBS presentation is implemented in Prompt 010 below.

## Streamer onboarding and dashboard (Prompt 009)

**No new migration, environment variables, dependencies or Twitch scopes.** Existing migrations 001–004 already store Mayor appearance/personality as JSON and allow revision-checked town names/settings. This milestone does not access or modify your live database automatically.

After signing in, select **My town**. `/dashboard` loads only the authenticated user's owned town. Users without a town are redirected to `/onboarding`; existing owners opening onboarding are sent back to the dashboard. Signing in or visiting either page does not create a town. The wizard introduces the community and Mayor, previews the current environment, collects choices, then shows a review screen. Only **Create my town** performs the authenticated server write. Chat/subscriber permissions are optional and can be authorized afterward through the existing panels.

Willowbrook and Mochito are retained as saved: no recreation, seed change or house movement. Missing/legacy `default` appearance renders as the original cream cat. Older numeric personality settings remain unchanged and appear as **Existing personality** until a new preset is deliberately selected. Renaming alone does not rewrite those values.

| Mayor option | Current implementation |
| --- | --- |
| Cream, orange tabby, gray, dark | Coordinated local SVG previews and matching procedural PixiJS colors; orange has forehead stripes. |
| Playful | More stroll decisions toward the plaza and shorter idle pauses. |
| Curious | More stroll decisions toward nearby residential doorsteps. |
| Calm | Longer idle pauses, with occasional walks toward Town Hall. |
| Mischievous | More direction reversals and occasional exploratory doorstep choices. |

Personality decisions are seeded and tested; they do not change travel speed. Community event tasks take priority. Naps, construction inspections, mischief interactions and richer animation are not implemented. Legacy personalities retain their earlier behavior.

The dashboard includes a saved-town preview, population, active verified subscriber homes, total plots, town/Mayor settings, and the existing chat/housing controls. The preview shows saved settings and autonomous movement; use **Town Overview** for live chat activity and celebrations. No Twitch token or Supabase secret is sent to the browser. Settings use `PATCH /api/town/settings`, session-derived ownership, origin/CSRF checks, strict validation and the existing transaction revision. House ownership, customization, roads/districts, seed and event receipts are preserved. A conflict keeps the draft visible; **Reload saved settings** explicitly discards it and loads the latest revision. Status polling never silently overwrites an edit draft.

### Manual verification

1. Run `npm run dev`, open http://localhost:3000, sign in and select **My town**. With the existing owner, expect Willowbrook/Mochito on `/dashboard`. Opening `/onboarding` should redirect back without creating anything.
2. With an authenticated account that has no town (prefer a development database), open `/onboarding`. Try Back/Next, an empty name, the four Mayor cards and four personalities. Nothing persists before the final **Create my town** action. Basic login alone must suffice.
3. Create after reviewing. Confirm the dashboard shows the chosen names, Mayor colors and starting counts. Reload and revisit onboarding; it must retain the same town and bypass the wizard. Do not delete a production town to repeat this test.
4. Save a town rename, Mayor rename, appearance and personality. Confirm the success message and preview, then open the Overview and reload. Check the in-world Mayor and portrait, streets, houses, customizations, camera and saved seed.
5. Open dashboard settings in two tabs. Save in the first, then save an edit based on the old revision in the second: expect a conflict with its draft retained. Use **Reload saved settings** before editing again. Live subscriber updates may also cause legitimate conflicts.
6. Sign out, then visit `/dashboard`: expect `/account`, with no owner dashboard. Another user can access only their own town/onboarding. Check **My Houses**, chat authorization/connection and subscriber sync still work from the reused panels.
7. In the isolated Overview demo, exercise events and regeneration. Return to the dashboard: the saved town must be unchanged. Check mobile widths and keyboard navigation through steps, radio cards and camera controls manually.

Wizard drafts are not saved across reloads. Dashboard status refreshes on focus, housing changes and a 20-second timer; appearance changes in another open Overview may need focus/reload. Auth/EventSub still need one long-running Node process. No automated browser interaction or visual inspection was performed.

Authentication references: [Twitch authorization code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow), [required token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), [refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/), [revocation](https://dev.twitch.tv/docs/authentication/revoke-tokens/), and [Get Users](https://dev.twitch.tv/docs/api/reference/#get-users).

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [PixiJS application lifecycle](https://pixijs.com/8.x/guides/components/application), [PixiJS graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics), and [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).

## OBS integration (Prompt 010)

**Manual migration required:** review and apply [202610290005_obs_display.sql](supabase/migrations/202610290005_obs_display.sql) once after 001–004, using the same trusted database administrator. Run the complete file as one transaction. It creates only display configuration/access storage and two restricted RPCs; it does not rewrite town snapshots, houses, layouts, customizations or Mayor settings. An accidental full-file rerun fails at the existing table and rolls back. Do not bypass that error by executing fragments. Tests use disposable PostgreSQL; no live database is accessed or migrated automatically.

No additional dependencies, environment variables, OAuth scopes or credentials are required. Keep the existing server-only configuration. From `F:\Development\TwitchLivingTown` run:

```powershell
npm install
npm run build
npm start
```

For development use `npm run dev` instead of build/start. Production mode avoids development indicators in the capture. Keep the backend running on a machine OBS can reach. For OBS on the same computer, `http://localhost:3000` works. A different computer needs the application's reachable HTTPS address and matching existing deployment/OAuth configuration; its `localhost` is not your server.

### Add the Browser Source

1. Sign in as the town owner, open **My town → Dashboard**, and connect live chat (and subscriber events if desired) through the existing controls. Wait for confirmed subscription readiness. OBS never initiates OAuth or grants permissions.
2. In **OBS & Stream Display**, select **Living Town**, then **Save display preferences**. Click **Generate OBS URL** (or **Regenerate OBS access** if already configured).
3. Click **Preview OBS Display** to open the exact read-only scene in Chrome. It shows your saved town with no site navigation or dashboard controls. Check smooth neighborhood camera following and the status chip. The private key is in the URL fragment; no Twitch cookie or token is needed by this scene.
4. Click **Copy OBS Browser Source URL**. In OBS Studio, add **Sources → + → Browser**, name it Living Town, leave **Local file** unchecked, and paste the entire URL including `#key=…` into **URL**. Set **Width 1920**, **Height 1080**, and **FPS 30** (60 is optional). Leave the default transparent browser-source CSS in place. Fit the source to your scene.
5. For uninterrupted presentation when switching scenes, leave **Shutdown source when not visible** and **Refresh browser when scene becomes active** unchecked. Enabling them is supported, but recreates local movement state and reloads the saved world each time. 1280×720 is also supported.
6. Close the dashboard. The OBS source should continue animating and receiving already-connected backend activity. The bottom-right chip distinguishes live chat/message count from disconnected chat and backend failures.

The URL is a **private, revocable read-only key**, not an administrator login. Keep it out of public chats, screenshots and shared OBS exports. Only its SHA-256 hash is stored; the raw URL is shown once per generation and is not recoverable after dashboard reload. Copy it while available, or regenerate and update OBS. Regeneration invalidates every old source using the former URL. **Revoke access** disables it without changing the saved preferences or town. Connected sources clear their scene on the next successful authorization poll (normally within three seconds). No automatic key expiry interrupts a stream; rotate/revoke from the dashboard when needed.

### Test both modes and live updates manually

1. **Living Town:** let the Mayor walk, check smooth framing, and send a fresh real message in the exact connected broadcaster channel. The message count should increase; accepted activity raises movement speed according to existing cooldown/decay rules. Broadcaster messages count too. Closing the dashboard must not stop the stream display.
2. **Mayor Spotlight:** select Spotlight, choose left and full-town background, save, then repeat with right. The same configured Mayor should appear enlarged with gentle idle/tail motion. Test the scale slider at 0.5× and 1.5×. Change the Mayor's appearance/personality through existing settings and verify the scene updates without moving houses. The background uses all current district bounds for uniform crop-to-fill framing; outer scenery may be cropped to avoid letterboxing.
3. Select **Transparent · Mayor only**, save, and place a colored/image source underneath the Browser Source in OBS. It should show through the background. The small status chip intentionally remains for source diagnostics. Living Town always uses the town background, regardless of the retained Spotlight background preference.
4. With existing verified subscriber synchronization/events, confirm new houses/customized exteriors and expansion appear after polling. Existing committed subscriber/resub/gift/expansion presentations can show brief generic feedback. Do not inject synthetic production events. Raid/Bits/donation reaction types are future hooks, not new live integrations.
5. Stop the backend briefly: OBS should retain its last saved view, show **Backend unavailable**, and let existing activity fade without generating messages. Restart the backend: saved visuals and OBS access recover automatically. Reconnect Twitch from the dashboard after a process restart/session expiry; the overlay should report disconnected chat until that succeeds.
6. Regenerate the URL: the old OBS source should clear and report invalid/revoked access. Paste the new URL and refresh the source. Revoke it and confirm access stops again. Another logged-in viewer cannot change the owner's display settings or use the URL to administer a town.
7. Revisit the normal Overview and verify pan, zoom, Fit Town, Mayor movement, live activity and demo regeneration. No OBS preferences affect the Overview's interactive camera.

OBS polls every three seconds after each completed request, sending only aggregated activity and refreshed display settings when world revision is unchanged. Revision changes include saved visual geometry. Each OBS view advances one local transient runtime; separate views need not place the Mayor at identical coordinates. Four anonymous scenery actors are not new Twitch residents. Reactions expire and are not a historical replay service. On a network outage the last received world is retained; revoked access can only be observed when the backend is reachable again.

The existing single-process live-connection/session limits still apply: use one continuously running Node backend. Shared/distributed live workers, browser GPU performance profiling at the largest town sizes, elaborate animations and further Twitch event types remain future work. Validation commands are `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`. No browser automation, live database modification, commit or push is performed by this milestone.

### Full-viewport OBS verification (Prompt 010C)

The OBS `<main>` previously inherited the site's `max-width: 1800px`, horizontal padding of 4.2%, and auto margins. Its canvas correctly measured that constrained container, leaving uncovered viewport strips. OBS now explicitly removes those constraints only on `.obs-root`. Spotlight also uses uniform crop-to-fill instead of the Overview's padded Fit Town framing. Living Town keeps its close follow camera; the existing sage terrain backdrop covers world-edge gaps and unbuilt areas without stretching or relocating anything. Transparent mode still hides both town and terrain; the intentional status chip remains visible.

1. Stop the old server with Ctrl+C. In the project root run `npm run build`, then `npm start`. No migration, environment change or new OBS URL is needed.
2. Open the existing private OBS URL in Chrome and reload it. Resize the window, including a tall/narrow shape; expect no scrollbars or uncovered side strips. The scene follows the viewport rather than a centered site column. Keep the private URL out of shared screenshots.
3. In OBS, open the Browser Source **Properties**, set Width **1920**, Height **1080**, FPS **30**, and click **Refresh cache of current page** after rebuilding. Keep the complete existing URL. Confirm the source's own boundaries contain no black/white margins; Transform → Fit to Screen only adjusts the source inside your OBS composition.
4. Save **Living Town** in the dashboard. Watch the Mayor walk and follow near outer edges and expanded neighborhoods. Houses must retain their proportions and positions, with no camera shaking or exposed transparent sidebars.
5. Save **Mayor Spotlight** with town background. Test left and right placement, then scale 0.5×, 1× and 1.5×. The Mayor must stay fully visible. Some outer town scenery is intentionally cropped, with no nonuniform stretching.
6. Change Browser Source dimensions to **1280×720**, refresh, and repeat both modes and both sides. Also resize Chrome. No town regeneration or new rendering instance should be needed for resizing.
7. Save **Transparent · Mayor only**. Put a colored source below it in OBS: it should show through everywhere except the Mayor and intentional status/foreground elements. Switch back to town background and confirm full coverage returns.
8. Return to the normal Overview and dashboard: their original page margins, interactive camera and Fit Town behavior remain intact.

For a manual dimension check in Chrome DevTools Console, run the following on the overlay page. It reports only dimensions, never the private URL or token. The canvas CSS bounds should match the host and viewport; buffer dimensions should be CSS size multiplied by the capped device pixel ratio (up to rounding).

```js
(() => {
  const host = document.querySelector('.obs-canvas');
  const canvas = host.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  return {
    viewport: [innerWidth, innerHeight],
    host: [host.clientWidth, host.clientHeight],
    canvasCSS: [rect.x, rect.y, rect.width, rect.height],
    buffer: [canvas.width, canvas.height],
    expectedDensity: Math.min(devicePixelRatio || 1, 2)
  };
})();
```

Automated regression tests cover the stylesheet boundary, CSS-pixel/density sizing, uniform cover/follow camera calculations, expanded bounds and foreground visibility/transparency across resize. Actual browser layout, GPU rendering and OBS compositing remain manual checks; no browser automation is used.

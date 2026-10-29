# Twitch Living Town

A cozy, seeded 2D village for the Codex x TwitchCon Hackathon, with a renderer-independent event simulation and Mochi, its cat-like Mayor. The Town Overview supports Twitch login, real chat, persistent Supabase towns, verified subscriber imports and live subscription housing. Other community events remain simulated in an isolated demo.

## Run locally

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
6. To check revocation, connect, then remove Living Town in your Twitch connections settings. The server detects revocation at its next validation (normally within 31 minutes), and the account UI refreshes on window focus or every five minutes. Restarting the Node server also invalidates all local sessions immediately. An idle session expires absolutely after eight hours.

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

Auth currently requires **one continuously running Node process**. Opaque 256-bit cookie IDs refer to server-memory records; only HMAC digests of IDs are stored. Access/refresh tokens are AES-256-GCM encrypted using keys derived from `SESSION_SECRET`. OAuth state is browser-bound, single-use and expires after ten minutes. No credentials or tokens enter browser storage, client bundles or public session responses. Tokens are held transiently in plaintext only while making server-side Twitch requests.

Validation runs on login, startup re-entry, stale session reads, and a background timer every minute with a 30-minute freshness threshold, inside Twitch's hourly requirement. The owner guard forces fresh validation. Expired tokens are refreshed after Twitch rejects them, with rotated refresh tokens retained; unexpected revocation or unverifiable identity ends affected sessions. A Twitch validation outage fails closed and requires reconnection. Sign-out removes local sessions first and attempts revocation; encrypted pending revocations retry for up to an hour while the process remains running.

Session/state/revocation records disappear on restart; no tokens are persisted to disk. The prototype caps active sessions at 200 and pending login attempts at 1,000. Multiple replicas, serverless suspension and durable sessions require shared storage with atomic state consumption, refresh coordination and a scheduled validation worker before deployment. Town mutations check authenticated ownership against the trusted repository; login alone grants no administration rights.

For production authentication, register an **HTTPS** callback and configure `TWITCH_REDIRECT_URI` accordingly; plain HTTP is rejected in production. `npm start` over local HTTP remains useful for checking the town, but local OAuth testing should use `npm run dev`. Changing `SESSION_SECRET` requires a full process restart and invalidates sessions. Keep reverse-proxy/hosting access logs from recording callback query strings, authorization headers or token bodies. Next development callback request logging is suppressed in `next.config.ts`; infrastructure logging is configured separately.

## Connect real Twitch chat (Prompt 004)

No additional environment variables, webhook tunnel, worker command or dependencies are needed. EventSub runs on the server in the same continuously running Node process as the existing in-memory auth service. **Fully restart the development server after upgrading this code**, then use `npm run dev`. Hot reloads reuse a process-wide connection manager rather than creating duplicate sockets; restart after changing auth/connection internals so retained instances load the new code.

1. Sign in to **Living Town** with the Twitch account whose own channel you want to connect. Return to the Town Overview. Existing basic sessions show **Chat permission: not granted**.
2. In the **Twitch chat** panel, select **Authorize Twitch Chat** and approve `user:read:chat` for that same account. Declining keeps chat disconnected; switching accounts during this authorization is rejected. Successful authorization returns to the town with **Chat permission: authorized**.
3. Select **Connect Chat**. Wait for **WebSocket: connected** and **Chat subscription: ready (channel.chat.message)**. Readiness requires the successful subscription response, not just the socket welcome. **LIVE SOURCE** identifies the selected town view; it does not promise a working subscription. On a second tab, select **View live town**; tabs share one Twitch connection.
4. Open the connected channel's Twitch chat and send an ordinary message (you or another chatter can send it). Within roughly one second plus network latency, **Last event** and the message count update. The activity meter rises and the Mayor/ambient townspeople become more active. Ordinary chat creates no resident, follower, subscriber or house records.
5. Try messages from several people to reach a higher activity level. One user earns credit at most every ten seconds, and repeated normalized text from that user earns no new credit during the 60-second window. Message count includes valid unique messages even when spam controls award no activity. Stop chatting: the meter fades to peaceful within 60 seconds.
6. Pan/zoom while receiving messages: the camera stays put. **View simulated town** exposes the original development simulator; its events never affect the live feed or saved town. Switch back using **View live town**. Switching sources resets the camera for that different town. Regenerate changes only the demo/unsaved preview; it is disabled for saved layouts. It does not disconnect Twitch or erase the server's recent chat activity.
7. **Disconnect Chat** stops the shared connection for your channel. **Connect/Reconnect Chat** restarts it. Brief socket/network failures reconnect automatically with backoff; Twitch-directed reconnects transfer the subscription. Closing all tabs does not disconnect until sign-out/session expiry or an explicit disconnect. Sign-out or Twitch revocation closes the connection; reconnect your account and authorize chat again when needed.

Live source is a personal channel preview, not ownership of any other town. Only the signed-in channel can be selected; no browser-supplied broadcaster ID is accepted. Start/stop/authorize controls require the session, same-origin POST and CSRF. Status requires authentication and is never publicly cached. This phase does not expose a public live town directory or administration API.

The server maps Twitch message IDs into the existing `CHAT_MESSAGE` processor and namespaces towns by broadcaster ID. Readable message text is used only transiently for validation/normalization, then replaced with a keyed fingerprint for the existing repeated-text rule. Fingerprints and chatter IDs expire with the 60-second activity window. The browser receives only activity sample ages, channel identity, status, count and last-event time—not chat text, chatter IDs, credentials or tokens. Live delivery IDs are retained for ten minutes (up to 10,000); the live outcome ledger is capped at 1,000 and activity samples at 2,000. Events older than ten minutes are ignored; full dedup capacity drops new events until space expires. The development simulator retains its existing synthetic ledger behavior.

Limitations: sessions, connections and live activity are in memory; restart signs users out and requires reconnecting. At most 100 channel entries are maintained; inactive entries expire after ten minutes without status requests. This is for one long-running Node process, not serverless/Edge or multiple replicas. Moving to a worker or multi-streamer deployment will require shared encrypted auth storage, connection ownership/leases, distributed deduplication, validation scheduling and durable town ownership. Twitch does not replay messages lost during an ordinary disconnect. Browser updates currently use one-second authenticated polling; there is no Socket.IO or public event-writing endpoint. Production still requires HTTPS OAuth configuration.

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
3. Enter town and Mayor names and select **Create my town**. Wait for **Saved to Supabase** and **SAVED IN SUPABASE**. The Overview displays the saved name, Mayor and seed. Twelve unclaimed starter houses are scenery, not proof of subscribers. Repeated creation requests return the same town.
4. Change the Mayor name and select **Save Mayor name**. Reload the page, navigate through `/account`, then restart the Node server and sign in again. The town UUID, seed, buildings, plot coordinates and Mayor name must remain the same. OAuth sessions and temporary chat activity reset on server restart.
5. Authorize/connect chat as before. Send a message and confirm the activity meter/counter and Mayor movement. In Supabase, the town revision and processed-event row count should **not** change because of chat, movement or polling.
6. Select **View simulated town**, run subscribers/gifts/raids, regenerate or reset the demo. Return to **View live town**: the saved town is unchanged. Regeneration is intentionally disabled while viewing a saved town. Check existing camera pan/zoom and Mayor animation manually.
7. Sign in with another Twitch account (for simultaneous testing use a separate Chrome profile). It has no town until deliberately created, and gets an independent UUID/layout. It cannot update the first account's town. A viewer can own a separate town without gaining access to anyone else's town.
8. Optional: the authenticated `/api/town` response exposes your town UUID. `GET /api/towns/<UUID>` returns its public visual projection, with no residents, owner IDs, subscriptions, gifts or private customization data. Do not share the private `/api/town` response or CSRF token.
9. To test missing configuration, temporarily unset `SUPABASE_SECRET_KEY` locally, restart and try loading. Expect an explicit configuration error. Restore the setting and restart; the real town must load again. Database/network failure and rollback cases are covered offline by the automated tests; no failure creates a replacement town in memory.

Durable writes reuse the existing processor with transaction locks, revision checks, foreign keys and unique event/plot/owner constraints. Tests use disposable embedded PostgreSQL with synthetic identities; no live subscriber ownership is fabricated. Prompt 006 connects verified subscriptions to these APIs. Customization pages and layout expansion remain deferred. All `living_town_*` tables are RLS-enabled and inaccessible to browser roles. Twitch sessions are authorized by Next.js; Supabase Auth is not used, and RLS does not authorize the secret-key server on behalf of a Twitch user.

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

Capacity remains **14 permanent properties per town**: two vacant plots followed by twelve unclaimed starter homes. Additional verified subscribers remain recorded and waitlisted. Legacy homes remain occupied; they are not reassigned to other users. New districts, waitlist fulfillment, durable event queues, distributed workers and retention jobs remain future work. The exterior editor is implemented in Prompt 007. Sync has safety limits of 100 records/page, 500 pages, 10,000 distinct users and ten minutes; reaching a limit reports partial progress.

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
4. **Gift 2 subscriptions**, then **Replay gift recipients:** the gift count and ownership remain unchanged on replay. The event log acknowledges the gifter. Two expansion plots are filled first; later owners receive existing unclaimed homes. After 14 owners, additional subscribers are waitlisted.
5. **Chat burst:** eight sample people raise activity and ambient movement. Repeatedly press **Repeated chat**: the same text/user earns no additional activity during the window. With no chat, the score fades to peaceful within 60 seconds.
6. **Incoming raid:** Town Hall welcomes 25 temporary visitors for 20 seconds; house/resident counts stay unchanged.
7. **Reset demo town:** clear events, owners, residents and activity while keeping the seed. **Regenerate town** also changes the seed. Reload restores the starter demo.

Production builds hide the simulator by default. For an explicitly authorized demo, set `TOWN_DEMO_MODE=true` in the build environment before `npm run build`. Rebuild with it unset or `false` to disable again. Setting it only at `npm start` does not change a previously prerendered page. This flag grants no backend privileges; there is no event mutation endpoint.

The browser needs WebGL and hardware acceleration. A loading state and retryable error message cover renderer startup failures. Town artwork uses local procedural graphics or inline SVG, with no art downloads or external font requests. Signed-in profile pictures load from Twitch's image CDN.

## Checks and production

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production build at http://localhost:3000 (see the HTTPS requirement for production authentication above). Stop a running server with Ctrl+C before starting another on that port. `typecheck` generates Next.js route types before checking TypeScript. Tests cover generation, simulation, OAuth state/callback failures, session cookies and encryption, expiry, validation/refresh/revocation, and tenant ownership guards. No tests contact Twitch or read local credentials.

Tests include all three migrations in disposable PostgreSQL, concurrent allocation/rollback/RLS, subscriber imports, housing/customization lifecycle, mocked EventSub, auth, town generation and live/demo separation. They do not read credentials or contact Twitch/Supabase. Applying outstanding migrations to your Supabase project and browser interaction checks remain manual; no browser automation is performed. See TASKS.md for validation results.

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
src/lib/auth/                      OAuth client, encrypted memory sessions, HTTP handlers, ownership guard and tests
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

The spatial layout uses a fixed connected block template. Seeds vary appearance and planting. New subscribers never trigger regeneration: two expansion plots and 12 unclaimed starter homes provide 14 ownership slots. Arbitrary district expansion and waitlist fulfillment are deferred. Runtime effects are not part of the saved-world shape. Deliberately created towns reload durable data from Supabase; local demos and temporary movement/activity remain in memory. Leaving the page can reset the demo, but it does not reset a saved town.

## Stack

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, ESLint and PixiJS 8. Exact versions are captured in `package-lock.json`. The application is initialized directly in the repository root.

See [PROJECT_SPEC.md](PROJECT_SPEC.md), [TASKS.md](TASKS.md) and [DECISIONS.md](DECISIONS.md) for the roadmap and architecture. Twitch events beyond chat/subscriptions, distributed realtime services, management portals and the OBS overlay are deferred.

Authentication references: [Twitch authorization code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow), [required token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), [refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/), [revocation](https://dev.twitch.tv/docs/authentication/revoke-tokens/), and [Get Users](https://dev.twitch.tv/docs/api/reference/#get-users).

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [PixiJS application lifecycle](https://pixijs.com/8.x/guides/components/application), [PixiJS graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics), and [Tailwind with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).

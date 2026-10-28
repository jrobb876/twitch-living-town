# Living Town database migrations

Apply **`migrations/202610280001_persistent_towns.sql`** manually, once, to your chosen Supabase project. The application never applies migrations automatically. Tests apply this same file only to disposable embedded PostgreSQL.

1. Review the SQL in Git. Confirm the selected Supabase project is the intended environment. Back up an existing database before schema work.
2. In that project's SQL Editor, paste the complete migration and run it as the database administrator. It runs inside one transaction and creates only `living_town_*` objects plus `living_towns`. It does not remove or rename existing application tables. If those names already exist, stop and inspect rather than dropping them or rerunning parts of the file.
3. Ensure Supabase's Data API is enabled and exposes `public`. The application uses three PostgREST RPCs in this schema. Browser roles have no privileges on these tables or functions; only `service_role` can execute the three entry points. Internal helper functions are not granted to that role.
4. In Supabase project settings, copy the Project URL and a **secret API key** (`sb_secret_...`) into the ignored local `.env.local` as `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Do not use a publishable/anon key, database password, Supabase Auth JWT, or `NEXT_PUBLIC_` variable. This configuration deliberately requires the new secret-key format. Leave existing Twitch configuration intact. Never paste keys into a ticket or chat.
5. Fully restart `npm run dev`, sign in through Twitch, and select **Reload saved town**. A successful `GET /api/town` response with `storage: "supabase"` and `town: null` verifies the API connection and migration even before town creation. The UI then offers **Create my town**. A configuration/migration/unavailable error does not create a replacement in memory.

Optional SQL Editor verification (no credentials or personal data returned):

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
  and (relname = 'living_towns' or relname like 'living_town_%')
order by relname;

select has_function_privilege('anon', 'public.living_town_load(uuid,text)', 'execute') as anon_can_read,
       has_function_privilege('authenticated', 'public.living_town_commit(text,jsonb,bigint,jsonb)', 'execute') as browser_can_write,
       has_function_privilege('service_role', 'public.living_town_create(jsonb,jsonb)', 'execute') as server_can_create;
-- Expect all eight tables to have RLS true, then false / false / true.
```

## Data and transaction contract

`living_towns.world` is the canonical, validated **schemaVersion 1 / generatorVersion 1** snapshot of the existing `TownWorld`. It contains stable layout, districts, plots, houses, residents, Mayor settings and gift reconciliation. The other tables are relational projections maintained inside the same transaction, with foreign keys, uniqueness and query indexes. They are not a second independently editable world. Do not edit projection tables through the Table Editor or write snapshots outside these RPCs.

- `living_town_create`: per-owner transaction lock and unique owner constraint; repeated/concurrent creation returns the existing town. Initial residents and property owners must be empty. Profile information comes from the verified Twitch session.
- `living_town_load`: load by UUID or owner ID. Next.js restricts private reads to the authenticated owner and sanitizes public reads.
- `living_town_commit`: locks the town row, verifies the server-supplied owner against the stored owner, checks the expected revision, records any verified durable event, then updates the snapshot and relational projections atomically. A conflicting revision causes a bounded read/reapply retry for verified events; interactive edits instead return HTTP 409. Unique `(town_id,event_id)`, `(town_id,plot_id)` and `(town_id,owner_twitch_user_id)` constraints prevent duplicate processing, plot collisions and multiple houses for a user within a town. Event recording rolls back if allocation fails.

House identity is the composite `(town UUID, existing house ID)` so the original renderer's `home-*` IDs remain stable. A user may own a property in each of several independent towns. Unclaimed starter houses have no owner; a later verified subscription first allocates an empty expansion plot, then an unclaimed starter house, using the existing processor. Full towns retain the existing waitlist behavior.

Names, Mayor settings and server-side house customization data can be saved without relocating houses. Layout, seed, plot identities, assigned property ownership and generator version are immutable in v1. A future generator upgrade must explicitly migrate an existing snapshot; loading an unsupported version fails safely instead of regenerating it. Add a new versioned SQL migration for future schema changes; do not edit an already-applied migration. Track application of this file in the project's migration history if using the Supabase CLI workflow.

## Security and privacy

Twitch authentication remains independent of Supabase Auth. A Twitch session is not a Supabase JWT and has no `auth.uid()` mapping. Next.js validates the Twitch session, origin, CSRF token and town ownership before mutations. Secret keys bypass RLS, so server authorization is mandatory. RLS with no browser policies, explicit privilege revocations and server-role-only `SECURITY DEFINER` entry points prevent direct browser access. The functions use an empty search path and qualified table names. Administrative credentials stay in a `server-only` composition module.

Protected routes accept only bounded settings, never an owner ID or arbitrary world snapshot. There is no browser endpoint for simulated events, verified-event ingestion, house allocation or house customization. `applyVerifiedEvent` is a server adapter boundary for a later Twitch integration; the caller must actually verify authenticity and entitlement first. Its source label is not a verifier. `assertHouseOwner` prepares property authorization but does not prove an active subscription. Future subscriber writes need both fresh entitlement verification and that guard.

Follower/subscriber status columns are `true` when known from a verified event, otherwise `NULL` (unknown). Their timestamps record when that evidence was applied; historical or current entitlement is never inferred from login, chat, or a starter house. No historical backfill or real subscription ingestion runs in this phase.

The public projection contains layout, appearance and Mayor display settings only. It omits resident identities, house owners/customization, profile information, subscription data, gifts and event outcomes. All created towns currently have public visual projections; private-town visibility controls are future work. Do not store sensitive information in public town or Mayor names.

Chat content, chat event IDs, activity windows, movement, effects and OAuth tokens are **not** written to these tables. Processed durable event receipts store only identity/type/source/time and the processor outcome; there is no chat history table. Outcomes/gift reconciliation have no retention job yet. Snapshot/input size caps fail explicitly rather than truncating durable data.

## Verification and limitations

`npm test` executes the migration using PGlite (embedded PostgreSQL), including real transaction rollback, permissions, uniqueness, duplicate/concurrent allocation and reload tests. It does not contact Supabase or read `.env.local`. A real Supabase project's gateway, configuration and permissions still require the manual connectivity test above.

Town data survives application restarts in Supabase. Twitch sessions, OAuth state, token refresh/revocation queues, chat sockets and activity remain process-local, so restart requires signing in again. Continue using one long-running Node process; persistence alone does not make authentication/EventSub serverless or multi-replica safe. Configure backups, account/town creation quotas, event retention and shared auth/socket coordination before public production rollout. Maximum snapshot size is approximately 1 MB, with 14 current housing slots. No destructive reset/delete API is implemented.

References: [Supabase secret keys](https://supabase.com/docs/guides/getting-started/api-keys), [database functions and execution permissions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

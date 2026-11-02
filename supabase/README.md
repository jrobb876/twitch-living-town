# Living Town database setup

Use your own isolated Supabase project for evaluation. The application never applies SQL automatically. All six migrations are committed; tests apply them only to disposable embedded PostgreSQL. Hosted Supabase initialization and the developer's live schema were not inspected during this audit.

## Fresh project

1. Create a Supabase project. Keep its database password private; the app uses a server API key instead.
2. Ensure the Data API is enabled and exposes `public`. The standard Supabase roles `anon`, `authenticated`, `service_role` must exist. These migrations require no external seed, storage bucket, Supabase Auth provider or separate extension setup.
3. Review and apply each **complete file once in this order**, through SQL Editor as the same trusted database owner/administrator:

   | Order | Migration | Purpose |
   | --- | --- | --- |
   | 001 | [202610280001_persistent_towns.sql](migrations/202610280001_persistent_towns.sql) | Initial tables, projections, RLS and create/load/commit RPCs |
   | 002 | [202610280002_subscriber_housing.sql](migrations/202610280002_subscriber_housing.sql) | Verified subscriber evidence and sync projection |
   | 003 | [202610280003_house_portal.sql](migrations/202610280003_house_portal.sql) | Owned-town lookup |
   | 004 | [202610290004_neighborhood_expansion.sql](migrations/202610290004_neighborhood_expansion.sql) | Append-only growth validation and commit update |
   | 005 | [202610290005_obs_display.sql](migrations/202610290005_obs_display.sql) | OBS settings/grants and display RPCs |
   | 006 | [202610290006_durable_auth.sql](migrations/202610290006_durable_auth.sql) | Durable authentication and process fencing |

4. Obtain the Project URL and a **secret API key** (`sb_secret_…`), and set `SUPABASE_URL` / `SUPABASE_SECRET_KEY` in ignored `.env.local`. The application requires this new key format: publishable/anon keys, legacy JWT service-role keys and database passwords are not accepted. Never use `NEXT_PUBLIC_` for secrets. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
5. Configure your own Twitch app as described in [README](../README.md#twitch-oauth-setup). For local evaluation, keep `AUTH_STORAGE=memory`; town data still persists. Restart Node after configuration changes.
6. Sign in and open `/dashboard`. Authenticated `GET /api/town` should return `storage: "supabase"`; `town: null` is expected before onboarding. Create your town through `/onboarding`, then reopen `/town-overview` to verify automatic loading. A storage error must be fixed, not replaced by a demo town.
7. To rehearse persistent auth, use `AUTH_STORAGE=supabase` only with this separate development database and migration 006. Keep `SESSION_SECRET` stable. Never point a local/staging auth writer at production: claiming its singleton store fences the existing process.

For existing projects, apply **only pending migrations**. Back up existing data before schema work. These files are transactional but **not idempotent**; reruns fail on existing objects/removed constraints and abort. Do not run fragments, drop tables or bypass errors. Roll back any aborted SQL session before continuing. SQL Editor applications need your own migration record; do not assume they populate CLI migration history.

## Readiness checks

These optional read-only queries can be run by the owner in your own project's SQL Editor. They return object/permission metadata, not credentials or resident records.

```sql
select signature,
       to_regprocedure(signature) is not null as installed,
       case when to_regprocedure(signature) is not null then
         has_function_privilege('service_role', to_regprocedure(signature), 'execute') end as server_execute,
       case when to_regprocedure(signature) is not null then
         has_function_privilege('anon', to_regprocedure(signature), 'execute') end as anon_execute,
       case when to_regprocedure(signature) is not null then
         has_function_privilege('authenticated', to_regprocedure(signature), 'execute') end as browser_execute
from (values
  ('public.living_town_create(jsonb,jsonb)'),
  ('public.living_town_load(uuid,text)'),
  ('public.living_town_commit(text,jsonb,bigint,jsonb)'),
  ('public.living_town_owned_towns(text)'),
  ('public.living_town_display_manage(text,uuid,text,jsonb,text)'),
  ('public.living_town_display_read(uuid,text)'),
  ('public.living_town_auth_claim(uuid)'),
  ('public.living_town_auth_check(uuid)'),
  ('public.living_town_auth_save(uuid,jsonb,jsonb)')
) as required(signature);
-- Nine rows: installed=true, server_execute=true,
-- anon_execute=false, browser_execute=false.

select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
  and (relname = 'living_towns' or relname like 'living_town_%')
order by relname;
-- Every application table listed must have relrowsecurity=true.
```

Missing objects usually mean an unapplied/failed migration or wrong project. Permission differences need investigation; do not grant broad access as a workaround. `/api/health` checks auth readiness and, in durable mode, its storage/writer; it does not validate every town RPC. Follow the signed-in town round trip above as well.

## Data and transaction contract

`living_towns.world` is the validated schemaVersion 1 / generatorVersion 1 canonical world. Relational projections are updated within the same transaction. Server-generated world updates use owner checks, expected revisions, row locking and unique event receipts. Concurrent writers retry against current state; failed commits roll back. Existing houses, ownership/customization, district geometry and Mayor settings are preserved by the allocation/growth rules. Growth appends validated neighborhoods rather than regenerating existing layouts.

Migration 002 intentionally allows subscriber status false for verified expiry; the nullable boolean represents true/false/unknown. Evidence tier/source constraints and application validation remain. Its revocations on the sync table and private projection helper are intentional: server-role RPC entry points execute as their trusted owner and invoke helpers internally. Do not grant direct helper access. Migration 004 replaces the commit function without removing its existing grants.

Subscriber sync establishes current verified membership, not historical tenure or gift history. Ended houses remain legacy. House saves accept only allowed exterior changes and require the authenticated owner plus current membership verification through the streamer's authorized Twitch session. Login/chat/fixture membership cannot grant permanent properties.

## Access boundaries

Twitch authentication is independent of Supabase Auth: no Supabase user/JWT or `auth.uid()` mapping is needed. Next.js validates Twitch identity, ownership and CSRF/origin before actions. Browser roles have neither table access nor RPC execution. `SECURITY DEFINER` entry points have empty search paths and qualified references. The secret-key service role is trusted across towns, so server authorization remains essential; RLS cannot protect against a compromised server secret.

The public world projection includes layout and visible house/Mayor settings, not private owners, membership or auth data. Do not put secrets in visible names. No client API accepts arbitrary world snapshots or fabricated verified Twitch events.

Migration 006 stores HMACed session identifiers and AES-256-GCM encrypted OAuth credentials/revocations. It does not encrypt the entire JSONB record: trusted administrators can read public profile fields, scopes and timestamps. Only the auth claim/check/save RPCs are granted to service_role; direct auth-table access remains denied. One active process owns the durable runtime. Expiration/revocation persists, failed writes fail closed, and startup revalidates restored sessions. Existing town/housing/OBS records are untouched. See [deployment and recovery](../DEPLOYMENT.md).

## Validation scope and limitations

`npm test` applies 001–006 to disposable PGlite PostgreSQL fixtures and tests permissions, upgrades, rollback, allocation, growth, customization, OBS access and durable auth. It does not contact Supabase or read `.env.local`. Source review found all application RPC dependencies represented in these files; it cannot prove the absence of historical changes in an uninspected live project. Hosted gateway configuration and a new real project still need manual verification.

Saved towns survive restarts. In memory-auth mode, sign in again; durable auth can restore unexpired sessions. OAuth state, live sockets, activity/reaction queues and in-flight jobs remain process-local. Reconnect via **Connect My Twitch Community** and retry incomplete imports after restart. Run one long-lived Node instance. Snapshot sizes, event receipts and town capacity are bounded; retention jobs, distributed workers and broader scaling remain future work.

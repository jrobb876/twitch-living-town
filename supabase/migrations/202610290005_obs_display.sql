-- Apply manually after 001–004, as the same trusted database owner.
-- No town snapshots, geometry, ownership or Mayor records are rewritten.
begin;
create table public.living_town_displays (
  town_id uuid primary key references public.living_towns(id),
  settings jsonb not null default '{"mode":"living-town","side":"left","background":"town","scale":1}',
  token_hash text check (token_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  constraint living_town_display_settings_check check ((
    jsonb_typeof(settings) = 'object' and
    settings ?& array['mode','side','background','scale'] and
    settings - array['mode','side','background','scale'] = '{}'::jsonb and
    settings->>'mode' in ('living-town','spotlight') and
    settings->>'side' in ('left','right') and
    settings->>'background' in ('town','transparent') and
    jsonb_typeof(settings->'scale') = 'number' and
    (settings->>'scale')::numeric between 0.5 and 1.5
  ) is true)
);
alter table public.living_town_displays enable row level security;
revoke all on public.living_town_displays from public,anon,authenticated,service_role;

-- Server-only entry point. p_owner comes from the validated Twitch session,
-- never from the request body. Town lock serializes concurrent access rotation.
create function public.living_town_display_manage(p_owner text, p_id uuid, p_action text, p_settings jsonb default null, p_hash text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id text; row public.living_town_displays;
begin
  select owner_twitch_user_id into owner_id from public.living_towns where id=p_id for update;
  if owner_id is null or owner_id is distinct from p_owner then
    raise exception using errcode='LT403',message='forbidden';
  end if;
  if p_action not in ('status','save','rotate','revoke') or p_action is null then
    raise exception using errcode='LT400',message='invalid action';
  end if;
  if p_action='save' and p_settings is null or p_action='rotate' and (p_hash is null or p_hash !~ '^[0-9a-f]{64}$') then
    raise exception using errcode='LT400',message='invalid display input';
  end if;
  insert into public.living_town_displays(town_id) values(p_id) on conflict do nothing;
  if p_action='save' then update public.living_town_displays set settings=p_settings,updated_at=now() where town_id=p_id;
  elsif p_action='rotate' then update public.living_town_displays set token_hash=p_hash,updated_at=now() where town_id=p_id;
  elsif p_action='revoke' then update public.living_town_displays set token_hash=null,updated_at=now() where town_id=p_id;
  end if;
  select * into row from public.living_town_displays where town_id=p_id;
  return jsonb_build_object('settings',row.settings,'enabled',row.token_hash is not null);
end $$;

-- Validate the capability on EVERY read, even when the world revision is unchanged.
-- This returns private data to the trusted backend only; it must project public visuals.
create function public.living_town_display_read(p_id uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object('settings',d.settings,'world',t.world,'revision',t.revision)
    into result from public.living_town_displays d join public.living_towns t on t.id=d.town_id
    where d.town_id=p_id and d.token_hash=p_hash and d.token_hash is not null;
  if result is null then raise exception using errcode='LT403',message='forbidden'; end if;
  return result;
end $$;
revoke all on function public.living_town_display_manage(text,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.living_town_display_read(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.living_town_display_manage(text,uuid,text,jsonb,text) to service_role;
grant execute on function public.living_town_display_read(uuid,text) to service_role;
commit;

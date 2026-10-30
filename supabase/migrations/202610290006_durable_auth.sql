-- Prompt 011A. Manual review/application only, after 001–005, as the same trusted owner.
-- One active Node auth writer. Restart claims fence older process snapshots.
-- Towns, houses, OBS grants and existing RPC privileges are untouched.
begin;
create table public.living_town_auth_runtime (
  singleton boolean primary key default true check (singleton),
  holder uuid not null,
  sessions jsonb not null default '{}' check (jsonb_typeof(sessions)='object' and octet_length(sessions::text)<=2000000),
  revocations jsonb not null default '{}' check (jsonb_typeof(revocations)='object' and octet_length(revocations::text)<=2000000),
  updated_at timestamptz not null default now()
);
alter table public.living_town_auth_runtime enable row level security;
revoke all on public.living_town_auth_runtime from public,anon,authenticated,service_role;

create function public.living_town_auth_claim(p_holder uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.living_town_auth_runtime;
begin
  if p_holder is null then raise exception using errcode='LT400',message='invalid owner'; end if;
  insert into public.living_town_auth_runtime(singleton,holder) values(true,p_holder)
    on conflict(singleton) do update set holder=excluded.holder,updated_at=now();
  select * into r from public.living_town_auth_runtime where singleton for update;
  return jsonb_build_object('sessions',r.sessions,'revocations',r.revocations);
end $$;
create function public.living_town_auth_check(p_holder uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from public.living_town_auth_runtime where singleton and holder=p_holder);
$$;
create function public.living_town_auth_save(p_holder uuid,p_sessions jsonb,p_revocations jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_sessions is null or p_revocations is null or jsonb_typeof(p_sessions)<>'object' or jsonb_typeof(p_revocations)<>'object' then
    raise exception using errcode='LT400',message='invalid snapshot';
  end if;
  update public.living_town_auth_runtime set sessions=p_sessions,revocations=p_revocations,updated_at=now()
    where singleton and holder=p_holder;
  if not found then raise exception using errcode='LT409',message='inactive process'; end if;
  return true;
end $$;
revoke all on function public.living_town_auth_claim(uuid) from public,anon,authenticated,service_role;
revoke all on function public.living_town_auth_check(uuid) from public,anon,authenticated,service_role;
revoke all on function public.living_town_auth_save(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.living_town_auth_claim(uuid) to service_role;
grant execute on function public.living_town_auth_check(uuid) to service_role;
grant execute on function public.living_town_auth_save(uuid,jsonb,jsonb) to service_role;
commit;

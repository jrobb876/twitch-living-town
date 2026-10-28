-- Review and apply once in Supabase SQL Editor. No existing project tables are altered.
begin;

create table public.living_town_users (
  twitch_user_id text primary key check (twitch_user_id ~ '^[0-9]{1,30}$'),
  display_name text not null check (length(display_name) between 1 and 100),
  login text, profile_image_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.living_towns (
  id uuid primary key,
  owner_twitch_user_id text not null unique references public.living_town_users(twitch_user_id),
  name text not null check (length(name) between 1 and 60),
  seed bigint not null check (seed between 0 and 4294967295),
  schema_version integer not null check (schema_version = 1),
  generator_version integer not null check (generator_version = 1),
  configuration jsonb not null default '{"visibility":"public"}',
  world jsonb not null check (jsonb_typeof(world) = 'object' and octet_length(world::text) <= 1200000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((world->>'id')::uuid = id and world->>'streamerTwitchUserId' = owner_twitch_user_id),
  check (world->>'name' = name and (world->>'seed')::bigint = seed),
  check ((world->>'schemaVersion')::integer = schema_version and (world->>'generatorVersion')::integer = generator_version),
  check (world->'processedEvents' = '[]'::jsonb)
);
create table public.living_town_mayors (
  town_id uuid primary key references public.living_towns(id) on delete cascade,
  mayor_id text not null, name text not null check (length(name) between 1 and 60),
  companion_type text not null check (companion_type = 'cat'), headquarters_id text not null,
  appearance jsonb not null default '{"preset":"default"}',
  personality jsonb not null default '{"curiosity":0.5,"energy":0.5}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.living_town_districts (
  town_id uuid not null references public.living_towns(id) on delete cascade, id text not null,
  name text not null, kind text not null check (kind in ('civic','residential')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (town_id,id)
);
create table public.living_town_plots (
  town_id uuid not null, id text not null, district_id text not null,
  x double precision not null, y double precision not null, entrance_node_id text not null, building_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (town_id,id),
  foreign key (town_id,district_id) references public.living_town_districts(town_id,id)
);
create table public.living_town_houses (
  town_id uuid not null, id text not null, plot_id text not null,
  owner_twitch_user_id text references public.living_town_users(twitch_user_id),
  appearance jsonb not null, customization jsonb not null default '{}',
  size text not null default 'small' check (size in ('small','medium','large')),
  prestige integer not null default 0 check (prestige between 0 and 5),
  ownership_status text not null check (ownership_status in ('unclaimed','verified_subscriber','legacy')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (town_id,id), unique (town_id,plot_id), unique (town_id,owner_twitch_user_id),
  foreign key (town_id,plot_id) references public.living_town_plots(town_id,id),
  check ((owner_twitch_user_id is null) = (ownership_status = 'unclaimed'))
);
alter table public.living_town_plots add constraint living_town_plot_occupancy_fk
  foreign key (town_id,building_id) references public.living_town_houses(town_id,id) deferrable initially deferred;
create table public.living_town_residents (
  town_id uuid not null references public.living_towns(id), twitch_user_id text not null references public.living_town_users(twitch_user_id),
  resident_id text not null, display_name text not null, classification text not null check (classification in ('subscriber','follower','neighbor')),
  follower_status boolean check (follower_status is null or follower_status), subscriber_status boolean check (subscriber_status is null or subscriber_status),
  follower_verified_at timestamptz, subscriber_verified_at timestamptz,
  subscription_months integer not null default 0 check (subscription_months >= 0), house_id text,
  housing_status text not null check (housing_status in ('none','housed','waiting')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (town_id,twitch_user_id), unique (town_id,resident_id), unique (town_id,house_id),
  foreign key (town_id,house_id) references public.living_town_houses(town_id,id) deferrable initially deferred
);
create table public.living_town_processed_events (
  town_id uuid not null references public.living_towns(id), event_id text not null check (length(event_id) between 1 and 4096),
  event_type text not null check (event_type in ('NEW_FOLLOWER','NEW_SUBSCRIBER','RESUBSCRIPTION','GIFT_SUBSCRIPTION')),
  source text not null check (source = 'twitch_verified'), occurred_at timestamptz not null,
  processed_at timestamptz not null default now(), outcome jsonb not null,
  primary key (town_id,event_id)
);
create index living_town_house_owner_idx on public.living_town_houses(owner_twitch_user_id);
create index living_town_resident_user_idx on public.living_town_residents(twitch_user_id);
create index living_town_event_time_idx on public.living_town_processed_events(town_id,processed_at);

-- The versioned world is canonical. Relational constraint/index projections are changed
-- in the SAME transaction by the RPC below. Never edit a projection table independently.
create function public.living_town_project(w jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare tid uuid := (w->>'id')::uuid; item jsonb; settings jsonb;
begin
  for item in select value from jsonb_array_elements(w->'residents') loop
    insert into public.living_town_users(twitch_user_id,display_name) values (item->>'twitchUserId',item->>'displayName') on conflict do nothing;
  end loop;
  item := w->'mayor';
  insert into public.living_town_mayors(town_id,mayor_id,name,companion_type,headquarters_id,appearance,personality)
    values(tid,item->>'id',item->>'name',item->>'species',item->>'headquartersId',coalesce(item->'appearance','{"preset":"default"}'),coalesce(item->'personality','{"curiosity":0.5,"energy":0.5}'))
    on conflict(town_id) do update set name=excluded.name,appearance=excluded.appearance,personality=excluded.personality,updated_at=now();
  for item in select value from jsonb_array_elements(w->'districts') loop
    insert into public.living_town_districts(town_id,id,name,kind) values(tid,item->>'id',item->>'name',item->>'kind')
      on conflict(town_id,id) do update set name=excluded.name,updated_at=now();
  end loop;
  for item in select value from jsonb_array_elements(w->'plots') loop
    insert into public.living_town_plots(town_id,id,district_id,x,y,entrance_node_id,building_id)
      values(tid,item->>'id',item->>'districtId',(item->'position'->>'x')::float8,(item->'position'->>'y')::float8,item->>'entranceNodeId',item->>'buildingId')
      on conflict(town_id,id) do update set building_id=excluded.building_id,updated_at=now();
  end loop;
  for item in select value from jsonb_array_elements(w->'buildings') where value->>'kind' = 'house' loop
    settings := item->'property';
    insert into public.living_town_houses(town_id,id,plot_id,owner_twitch_user_id,appearance,size,prestige,ownership_status,customization)
      values(tid,item->>'id',item->>'plotId',item->>'ownerTwitchUserId',item->'appearance',coalesce(settings->>'size','small'),coalesce((settings->>'prestige')::int,0),
        coalesce(settings->>'status',case when item->>'ownerTwitchUserId' is null then 'unclaimed' else 'verified_subscriber' end),coalesce(settings->'customization','{}'))
      on conflict(town_id,id) do update set owner_twitch_user_id=excluded.owner_twitch_user_id,appearance=excluded.appearance,size=excluded.size,
        prestige=excluded.prestige,ownership_status=excluded.ownership_status,customization=excluded.customization,updated_at=now();
  end loop;
  for item in select value from jsonb_array_elements(w->'residents') loop
    insert into public.living_town_residents(town_id,twitch_user_id,resident_id,display_name,classification,follower_status,subscriber_status,follower_verified_at,subscriber_verified_at,subscription_months,house_id,housing_status)
      values(tid,item->>'twitchUserId',item->>'id',item->>'displayName',case when (item->>'isSubscriber')::boolean then 'subscriber' when (item->>'isFollower')::boolean then 'follower' else 'neighbor' end,
        case when (item->>'isFollower')::boolean then true end,case when (item->>'isSubscriber')::boolean then true end,
        case when (item->>'isFollower')::boolean then now() end,case when (item->>'isSubscriber')::boolean then now() end,
        (item->>'subscriptionMonths')::int,item->>'houseId',item->>'housingStatus')
      on conflict(town_id,twitch_user_id) do update set display_name=excluded.display_name,classification=excluded.classification,
        follower_status=excluded.follower_status,subscriber_status=excluded.subscriber_status,
        follower_verified_at=coalesce(public.living_town_residents.follower_verified_at,excluded.follower_verified_at),
        subscriber_verified_at=coalesce(public.living_town_residents.subscriber_verified_at,excluded.subscriber_verified_at),
        subscription_months=excluded.subscription_months,house_id=excluded.house_id,housing_status=excluded.housing_status,updated_at=now();
  end loop;
  if exists(select 1 from public.living_town_houses h join public.living_town_plots p on p.town_id=h.town_id and p.id=h.plot_id
    where h.town_id=tid and p.building_id is distinct from h.id)
    or exists(select 1 from public.living_town_residents r join public.living_town_houses h on h.town_id=r.town_id and h.id=r.house_id
      where r.town_id=tid and h.owner_twitch_user_id is distinct from r.twitch_user_id)
    then raise exception using errcode='LT400',message='invalid occupancy'; end if;
end $$;

create function public.living_town_envelope(p_id uuid) returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('world',world,'revision',revision,'updatedAt',updated_at) from public.living_towns where id=p_id;
$$;
create function public.living_town_load(p_id uuid default null, p_owner text default null) returns jsonb language sql security definer set search_path = '' as $$
  select public.living_town_envelope(id) from public.living_towns where (p_id is not null and id=p_id) or (p_id is null and owner_twitch_user_id=p_owner);
$$;
create function public.living_town_create(p_profile jsonb,p_world jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare tid uuid; owner_id text := p_profile->>'twitchUserId';
begin
  if owner_id is null or owner_id is distinct from p_world->>'streamerTwitchUserId'
    or p_world->'residents' <> '[]'::jsonb or p_world->'giftGroups' <> '[]'::jsonb
    or exists(select 1 from jsonb_array_elements(p_world->'buildings') b where b->>'ownerTwitchUserId' is not null)
    then raise exception using errcode='LT400',message='invalid initial town'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id,0));
  insert into public.living_town_users(twitch_user_id,display_name,login,profile_image_url)
    values(owner_id,p_profile->>'displayName',p_profile->>'login',p_profile->>'profileImageUrl')
    on conflict(twitch_user_id) do update set display_name=excluded.display_name,login=excluded.login,profile_image_url=excluded.profile_image_url,updated_at=now();
  select id into tid from public.living_towns where owner_twitch_user_id=owner_id;
  if tid is not null then return public.living_town_envelope(tid); end if;
  tid := (p_world->>'id')::uuid;
  insert into public.living_towns(id,owner_twitch_user_id,name,seed,schema_version,generator_version,world)
    values(tid,owner_id,p_world->>'name',(p_world->>'seed')::bigint,(p_world->>'schemaVersion')::int,(p_world->>'generatorVersion')::int,p_world);
  perform public.living_town_project(p_world);
  return public.living_town_envelope(tid);
end $$;

create function public.living_town_commit(p_owner text,p_world jsonb,p_revision bigint,p_event jsonb default null) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare current_town public.living_towns; prior_event jsonb; previous jsonb; replacement jsonb; tid uuid := (p_world->>'id')::uuid;
begin
  select * into current_town from public.living_towns where id=tid for update;
  if not found or current_town.owner_twitch_user_id is distinct from p_owner
    or p_world->>'streamerTwitchUserId' is distinct from p_owner then raise exception using errcode='LT403',message='forbidden'; end if;
  if p_event is not null then
    select outcome into prior_event from public.living_town_processed_events where town_id=tid and event_id=p_event->>'id';
    if found then return jsonb_build_object('status','duplicate','town',public.living_town_envelope(tid),'outcome',prior_event); end if;
  end if;
  if current_town.revision <> p_revision then return jsonb_build_object('status','conflict','town',public.living_town_envelope(tid)); end if;
  -- Generator upgrades need an explicit reviewed migration; never silently regenerate.
  if current_town.world->'seed' is distinct from p_world->'seed' or current_town.world->'layout' is distinct from p_world->'layout'
    or current_town.world->'districts' is distinct from p_world->'districts'
    or current_town.world->'schemaVersion' is distinct from p_world->'schemaVersion'
    or current_town.world->'generatorVersion' is distinct from p_world->'generatorVersion'
    or current_town.world->'mayor'->'id' is distinct from p_world->'mayor'->'id'
    or jsonb_array_length(current_town.world->'plots') <> jsonb_array_length(p_world->'plots')
    then raise exception using errcode='LT409',message='stable layout'; end if;
  for previous in select value from jsonb_array_elements(current_town.world->'plots') loop
    select value into replacement from jsonb_array_elements(p_world->'plots') where value->>'id'=previous->>'id';
    if replacement is null or previous-'buildingId' is distinct from replacement-'buildingId'
      then raise exception using errcode='LT409',message='stable plot'; end if;
  end loop;
  for previous in select value from jsonb_array_elements(current_town.world->'buildings') loop
    select value into replacement from jsonb_array_elements(p_world->'buildings') where value->>'id'=previous->>'id';
    if replacement is null or previous->'kind' is distinct from replacement->'kind' or previous->'position' is distinct from replacement->'position'
      or previous->'plotId' is distinct from replacement->'plotId'
      or (previous->>'ownerTwitchUserId' is not null and previous->'ownerTwitchUserId' is distinct from replacement->'ownerTwitchUserId')
      then raise exception using errcode='LT409',message='stable property'; end if;
  end loop;
  if p_event is null and (current_town.world->'residents' is distinct from p_world->'residents'
    or current_town.world->'giftGroups' is distinct from p_world->'giftGroups'
    or jsonb_array_length(current_town.world->'buildings') <> jsonb_array_length(p_world->'buildings')
    or exists(select 1 from jsonb_array_elements(current_town.world->'buildings') old_b
      join jsonb_array_elements(p_world->'buildings') new_b on old_b->>'id'=new_b->>'id'
      where old_b->'ownerTwitchUserId' is distinct from new_b->'ownerTwitchUserId'))
    then raise exception using errcode='LT403',message='verified event required'; end if;
  if p_event is not null then
    insert into public.living_town_processed_events(town_id,event_id,event_type,source,occurred_at,outcome)
      values(tid,p_event->>'id',p_event->>'type',p_event->>'source',to_timestamp((p_event->>'occurredAt')::numeric / 1000),p_event->'outcome');
  end if;
  update public.living_towns set world=p_world,name=p_world->>'name',revision=revision+1,updated_at=clock_timestamp() where id=tid;
  perform public.living_town_project(p_world);
  return jsonb_build_object('status','saved','town',public.living_town_envelope(tid));
end $$;

-- Twitch sessions are authorized by Next.js. They are NOT Supabase Auth JWTs.
-- RLS denies direct browser access. Only server secret-key RPC calls can access data.
do $$ declare item text; begin
  foreach item in array array['living_town_users','living_towns','living_town_mayors','living_town_districts','living_town_plots','living_town_houses','living_town_residents','living_town_processed_events'] loop
    execute format('alter table public.%I enable row level security',item);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',item);
  end loop;
end $$;
revoke all on function public.living_town_project(jsonb), public.living_town_envelope(uuid), public.living_town_load(uuid,text), public.living_town_create(jsonb,jsonb), public.living_town_commit(text,jsonb,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.living_town_load(uuid,text), public.living_town_create(jsonb,jsonb), public.living_town_commit(text,jsonb,bigint,jsonb) to service_role;
comment on table public.living_towns is 'Living Town schema v1. Canonical versioned world; update only through reviewed RPCs.';
commit;

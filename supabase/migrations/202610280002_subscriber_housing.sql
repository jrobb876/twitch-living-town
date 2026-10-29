-- Prompt 006. Review/apply after 202610280001. Existing property identities/layouts are retained.
-- Apply once, as the same database owner/administrator used for 001. A full-file
-- rerun fails on the already-removed constraint and aborts this transaction; it
-- does not partially reapply. Do not run individual statements to bypass errors.
begin;
-- Intentional: the old check admitted only true/NULL. The boolean column now
-- admits false for verified expiry, true for active membership, NULL for unknown.
alter table public.living_town_residents drop constraint living_town_residents_subscriber_status_check;
alter table public.living_town_residents add column subscription_tier text check (subscription_tier in ('1000','2000','3000'));
alter table public.living_town_residents add column is_gift boolean;
alter table public.living_town_residents add column evidence_source text check (evidence_source in ('sync','eventsub'));
alter table public.living_town_processed_events drop constraint living_town_processed_events_event_type_check;
alter table public.living_town_processed_events add constraint living_town_processed_events_event_type_check
  check (event_type in ('NEW_FOLLOWER','NEW_SUBSCRIBER','RESUBSCRIPTION','GIFT_SUBSCRIPTION','SUBSCRIPTION_ENDED'));
create table public.living_town_subscriber_syncs (
  town_id uuid primary key references public.living_towns(id), summary jsonb not null,
  updated_at timestamptz not null default now(),
  check (summary->>'status' in ('running','complete','partial','failed'))
);
alter table public.living_town_subscriber_syncs enable row level security;
-- No direct table/helper privileges are needed by the secret-key service_role.
-- 001 grants that role only create/load/commit RPC execution. Those functions run
-- as their trusted owner and can call the helper/write projections internally.
revoke all on public.living_town_subscriber_syncs from public,anon,authenticated,service_role;

create or replace function public.living_town_project(w jsonb) returns void language plpgsql security definer set search_path = '' as $$
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

  for item in select value from jsonb_array_elements(w->'residents') where value ? 'subscription' loop
    update public.living_town_residents set
      subscriber_status=(item->'subscription'->>'active')::boolean,
      subscriber_verified_at=to_timestamp((item->'subscription'->>'verifiedAt')::numeric/1000),
      subscription_tier=item->'subscription'->>'tier', is_gift=(item->'subscription'->>'isGift')::boolean,
      evidence_source=item->'subscription'->>'source'
      where town_id=tid and twitch_user_id=item->>'twitchUserId';
  end loop;
  if w ? 'subscriberSync' then
    insert into public.living_town_subscriber_syncs(town_id,summary) values(tid,w->'subscriberSync')
      on conflict(town_id) do update set summary=excluded.summary,updated_at=now();
  end if;
end $$;
revoke all on function public.living_town_project(jsonb) from public,anon,authenticated,service_role;
commit;

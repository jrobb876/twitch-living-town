-- Prompt 008. Apply once after 001/002/003 using the same trusted administrator.
-- No existing layouts or rows are regenerated. Only the commit contract is extended.
begin;
create function public.living_town_assert_growth(old_world jsonb,new_world jsonb) returns void
language plpgsql set search_path = '' as $$
declare field text; before_array jsonb; after_array jsonb; prefix jsonb; previous jsonb; replacement jsonb; position bigint;
begin
  -- Core dimensions/landmarks remain the original generator's frame.
  if (old_world->'layout')-'roads'-'navigation'-'trees'-'flowers' is distinct from (new_world->'layout')-'roads'-'navigation'-'trees'-'flowers'
    or jsonb_array_length(new_world->'plots') <= jsonb_array_length(old_world->'plots')
    or jsonb_array_length(new_world->'plots') > 494
    or jsonb_array_length(new_world->'districts') <= jsonb_array_length(old_world->'districts')
    then raise exception using errcode='LT409',message='append-only growth'; end if;
  foreach field in array array['roads','trees','flowers','districts'] loop
    before_array := case when field='districts' then old_world->field else old_world->'layout'->field end;
    after_array := case when field='districts' then new_world->field else new_world->'layout'->field end;
    select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into prefix
      from jsonb_array_elements(after_array) with ordinality a(value,ord) where ord <= jsonb_array_length(before_array);
    if prefix is distinct from before_array then raise exception using errcode='LT409',message='existing geometry changed'; end if;
  end loop;
  for previous,position in select value,ord from jsonb_array_elements(old_world->'plots') with ordinality a(value,ord) loop
    replacement := new_world->'plots'->(position::int-1);
    if replacement is null or previous-'buildingId' is distinct from replacement-'buildingId'
      then raise exception using errcode='LT409',message='existing plot order changed'; end if;
  end loop;
  for previous,position in select value,ord from jsonb_array_elements(old_world->'layout'->'navigation') with ordinality a(value,ord) loop
    replacement := new_world->'layout'->'navigation'->(position::int-1);
    if replacement is null or previous-'neighbors' is distinct from replacement-'neighbors'
      or not ((replacement->'neighbors') @> (previous->'neighbors'))
      then raise exception using errcode='LT409',message='existing navigation changed'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(new_world->'layout'->'navigation') n group by n->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(new_world->'plots') p group by p->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(new_world->'districts') d group by d->>'id' having count(*)>1)
    then raise exception using errcode='LT400',message='duplicate geometry identity'; end if;
  -- New residential lots cannot overlap existing or other new house footprints.
  if exists(select 1 from jsonb_array_elements(new_world->'plots') with ordinality a(value,ord)
    join jsonb_array_elements(new_world->'plots') with ordinality b(value,ord) on a.ord > b.ord
    where a.ord > jsonb_array_length(old_world->'plots')
      and abs((a.value->'position'->>'x')::float8-(b.value->'position'->>'x')::float8)<220
      and abs((a.value->'position'->>'y')::float8-(b.value->'position'->>'y')::float8)<200)
    then raise exception using errcode='LT400',message='overlapping lots'; end if;
end $$;
revoke all on function public.living_town_assert_growth(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.living_town_commit(p_owner text,p_world jsonb,p_revision bigint,p_event jsonb default null) returns jsonb
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
  if current_town.world->'seed' is distinct from p_world->'seed'
    or current_town.world->'schemaVersion' is distinct from p_world->'schemaVersion'
    or current_town.world->'generatorVersion' is distinct from p_world->'generatorVersion'
    or current_town.world->'mayor'->'id' is distinct from p_world->'mayor'->'id'
    then raise exception using errcode='LT409',message='stable world identity'; end if;
  if current_town.world->'layout' is distinct from p_world->'layout'
    or current_town.world->'districts' is distinct from p_world->'districts'
    or jsonb_array_length(current_town.world->'plots') <> jsonb_array_length(p_world->'plots') then
    if p_event is null or p_event->>'type' not in ('NEW_SUBSCRIBER','RESUBSCRIPTION','GIFT_SUBSCRIPTION')
      then raise exception using errcode='LT409',message='verified growth required'; end if;
    perform public.living_town_assert_growth(current_town.world,p_world);
  end if;
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
-- Existing create/load/commit grants and all uniqueness/owner constraints remain intact.
commit;


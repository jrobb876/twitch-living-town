-- Apply after 001 and 002, as the same trusted database administrator. No data writes.
begin;
-- Server-only index lookup. Next.js supplies the validated Twitch ID, not client input.
create function public.living_town_owned_towns(p_user text) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(town_id order by town_id), '[]'::jsonb)
  from public.living_town_houses where owner_twitch_user_id=p_user;
$$;
revoke all on function public.living_town_owned_towns(text) from public,anon,authenticated,service_role;
grant execute on function public.living_town_owned_towns(text) to service_role;
commit;

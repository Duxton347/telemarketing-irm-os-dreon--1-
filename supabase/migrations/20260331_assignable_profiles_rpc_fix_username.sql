create or replace function public.list_assignable_profiles(
  p_include_inactive boolean default true
)
returns table (
  id uuid,
  username_display text,
  username_slug text,
  role text,
  active boolean,
  team_id uuid,
  sector_code text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username_display,
    p.username_slug,
    p.role,
    p.active,
    p.team_id,
    p.sector_code
  from public.profiles p
  where p_include_inactive or p.active = true
  order by p.username_display nulls last, p.username_slug nulls last;
$$;

revoke all on function public.list_assignable_profiles(boolean) from public;
grant execute on function public.list_assignable_profiles(boolean) to authenticated;

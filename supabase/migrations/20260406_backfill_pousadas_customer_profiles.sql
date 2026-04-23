update public.clients as client
set customer_profiles = (
  select array_agg(deduped.profile_value order by deduped.comparable, deduped.profile_value)
  from (
    select distinct on (normalized_profiles.comparable)
      normalized_profiles.comparable,
      case
        when normalized_profiles.comparable = 'pousadas' then 'Pousadas'
        else normalized_profiles.trimmed_value
      end as profile_value
    from (
      select
        case
          when lower(trim(profile_item)) in ('pousada', 'pousadas') then 'pousadas'
          else lower(trim(profile_item))
        end as comparable,
        trim(profile_item) as trimmed_value
      from unnest(coalesce(client.customer_profiles, '{}'::text[]) || array['Pousadas']) as profile_item
      where trim(coalesce(profile_item, '')) <> ''
    ) as normalized_profiles
    order by normalized_profiles.comparable,
      case when normalized_profiles.trimmed_value = 'Pousadas' then 0 else 1 end,
      normalized_profiles.trimmed_value
  ) as deduped
)
where coalesce(client.invalid, false) = false
  and (
    coalesce(client.name, '') ~* '(pousad|hotel|hostel|resort|guest[ -]?house|hosped|inn|chal[eé])'
    or coalesce(client.origin_detail, '') ~* '(pousad|hotel|hostel|resort|guest[ -]?house|hosped|inn|chal[eé])'
    or coalesce(client.website, '') ~* '(pousad|hotel|hostel|resort|guest[ -]?house|hosped|inn|chal[eé])'
  );

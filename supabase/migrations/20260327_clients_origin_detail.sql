alter table public.clients
  add column if not exists origin_detail text;

create index if not exists idx_clients_origin_detail
  on public.clients (origin_detail);

with latest_google_search_source as (
  select normalized_phone, process_name
  from (
    select
      regexp_replace(coalesce(sr.phone, ''), '[^0-9]+', '', 'g') as normalized_phone,
      sp.name as process_name,
      row_number() over (
        partition by regexp_replace(coalesce(sr.phone, ''), '[^0-9]+', '', 'g')
        order by sr.created_at desc nulls last, sr.id desc
      ) as row_rank
    from public.scraper_results sr
    join public.scraper_runs run on run.id = sr.run_id
    join public.scraper_processes sp on sp.id = run.process_id
    where sr.review_status = 'APPROVED'
      and coalesce(sr.phone, '') <> ''
      and coalesce(sp.name, '') <> ''
  ) ranked
  where row_rank = 1
)
update public.clients client
set origin_detail = latest_google_search_source.process_name
from latest_google_search_source
where client.origin = 'GOOGLE_SEARCH'
  and coalesce(client.origin_detail, '') = ''
  and regexp_replace(coalesce(client.phone, ''), '[^0-9]+', '', 'g') = latest_google_search_source.normalized_phone;

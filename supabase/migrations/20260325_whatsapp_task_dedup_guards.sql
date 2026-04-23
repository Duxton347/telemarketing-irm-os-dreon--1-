with ranked_duplicates as (
  select
    id,
    row_number() over (
      partition by client_id, type
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.whatsapp_tasks
  where client_id is not null
    and type is not null
    and status in ('pending', 'started')
)
delete from public.whatsapp_tasks
where id in (
  select id
  from ranked_duplicates
  where duplicate_rank > 1
);

create unique index if not exists idx_whatsapp_tasks_active_client_type_unique
  on public.whatsapp_tasks (client_id, type)
  where client_id is not null
    and type is not null
    and status in ('pending', 'started');

with ranked_duplicates as (
  select
    id,
    row_number() over (
      partition by client_id, type
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.tasks
  where client_id is not null
    and type is not null
    and status = 'pending'
)
delete from public.tasks
where id in (
  select id
  from ranked_duplicates
  where duplicate_rank > 1
);

create unique index if not exists idx_tasks_pending_client_type_unique
  on public.tasks (client_id, type)
  where client_id is not null
    and type is not null
    and status = 'pending';

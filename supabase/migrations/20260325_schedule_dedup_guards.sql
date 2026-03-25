with ranked_duplicates as (
  select
    id,
    row_number() over (
      partition by customer_id, (scheduled_for at time zone 'utc')::date
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.call_schedules
  where customer_id is not null
    and status in ('PENDENTE_APROVACAO', 'APROVADO', 'REPROGRAMADO')
)
delete from public.call_schedules
where id in (
  select id
  from ranked_duplicates
  where duplicate_rank > 1
);

create unique index if not exists idx_call_schedules_active_customer_day_unique
  on public.call_schedules (customer_id, ((scheduled_for at time zone 'utc')::date))
  where customer_id is not null
    and status in ('PENDENTE_APROVACAO', 'APROVADO', 'REPROGRAMADO');

create extension if not exists pgcrypto;

create or replace function public.set_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.operation_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sector_code text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists team_id uuid references public.operation_teams(id),
  add column if not exists sector_code text;

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  task_scope text not null check (task_scope in ('SETOR', 'PESSOAL')),
  recurrence_type text not null default 'NONE' check (recurrence_type in ('NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY', 'CUSTOM')),
  recurrence_config jsonb,
  is_accumulative boolean not null default false,
  generate_only_if_previous_closed boolean not null default false,
  requires_approval boolean not null default false,
  requires_comment_on_completion boolean not null default false,
  default_priority text not null default 'MEDIUM' check (default_priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  default_due_time text,
  created_by uuid references public.profiles(id),
  is_active boolean not null default true,
  assign_mode text not null default 'SPECIFIC' check (assign_mode in ('SPECIFIC', 'ALL', 'ROLE', 'TEAM')),
  assign_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.task_templates(id) on delete set null,
  source_type text not null check (source_type in ('TASK_INTERNAL', 'REPIQUE', 'AGENDAMENTO', 'PROTOCOLO', 'VISITA', 'ROTEIRO', 'WHATSAPP')),
  source_id uuid,
  title text not null,
  description text,
  category text not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  visibility_scope text not null default 'PRIVATE' check (visibility_scope in ('PRIVATE', 'TEAM', 'SECTOR')),
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  due_at timestamptz,
  starts_at timestamptz,
  completed_at timestamptz,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO', 'CONCLUIDO', 'ATRASADO', 'CANCELADO', 'ARQUIVADO')),
  is_recurring_instance boolean not null default false,
  is_accumulated boolean not null default false,
  carryover_from uuid references public.task_instances(id) on delete set null,
  completion_note text,
  metadata jsonb,
  recurrence_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_task_instances_recurrence_key_unique
  on public.task_instances(recurrence_key);

create index if not exists idx_task_instances_assigned_status_due
  on public.task_instances(assigned_to, status, due_at);

create index if not exists idx_task_instances_template_status
  on public.task_instances(template_id, status, due_at);

create index if not exists idx_task_instances_source
  on public.task_instances(source_type, source_id);

create table if not exists public.task_activity_logs (
  id uuid primary key default gen_random_uuid(),
  task_instance_id uuid not null references public.task_instances(id) on delete cascade,
  action text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  old_value jsonb,
  new_value jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_activity_logs_task_created
  on public.task_activity_logs(task_instance_id, created_at desc);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  related_entity_type text,
  related_entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user_unread
  on public.user_notifications(user_id, is_read, created_at desc);

drop trigger if exists trg_operation_teams_updated_at on public.operation_teams;
create trigger trg_operation_teams_updated_at
before update on public.operation_teams
for each row execute function public.set_timestamp();

drop trigger if exists trg_task_templates_updated_at on public.task_templates;
create trigger trg_task_templates_updated_at
before update on public.task_templates
for each row execute function public.set_timestamp();

drop trigger if exists trg_task_instances_updated_at on public.task_instances;
create trigger trg_task_instances_updated_at
before update on public.task_instances
for each row execute function public.set_timestamp();

create or replace function public.sync_task_recurring_instances(
  p_reference timestamptz default now(),
  p_horizon_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_assignee record;
  v_candidate_date date;
  v_reference_date date := p_reference::date;
  v_horizon_date date := (p_reference + make_interval(days => greatest(coalesce(p_horizon_days, 14), 1)))::date;
  v_anchor_date date;
  v_window_start date;
  v_due_time text;
  v_due_at timestamptz;
  v_recurrence_key text;
  v_created_count integer := 0;
  v_archived_count integer := 0;
  v_open_instance_id uuid;
  v_visibility_scope text;
begin
  for v_template in
    select *
    from public.task_templates
    where is_active = true
      and recurrence_type <> 'NONE'
  loop
    v_anchor_date := coalesce(
      nullif(v_template.recurrence_config ->> 'start_date', '')::date,
      v_template.created_at::date
    );
    v_window_start := greatest(v_anchor_date, v_reference_date - 45);
    v_due_time := coalesce(nullif(v_template.default_due_time, ''), '09:00');
    v_visibility_scope := case
      when v_template.task_scope = 'PESSOAL' then 'PRIVATE'
      when v_template.assign_mode = 'TEAM' then 'TEAM'
      else 'SECTOR'
    end;

    for v_assignee in
      with resolved_profiles as (
        select p.id, p.role, p.team_id, p.sector_code
        from public.profiles p
        where p.active = true
          and (
            v_template.assign_mode = 'ALL'
            or (
              v_template.assign_mode = 'SPECIFIC'
              and (
                p.id::text = coalesce(v_template.assign_config ->> 'user_id', '')
                or p.id in (
                  select value::uuid
                  from jsonb_array_elements_text(coalesce(v_template.assign_config -> 'user_ids', '[]'::jsonb))
                )
              )
            )
            or (
              v_template.assign_mode = 'ROLE'
              and p.role in (
                select value
                from jsonb_array_elements_text(coalesce(v_template.assign_config -> 'roles', '[]'::jsonb))
              )
            )
            or (
              v_template.assign_mode = 'TEAM'
              and (
                p.team_id::text = any (
                  array(
                    select value
                    from jsonb_array_elements_text(coalesce(v_template.assign_config -> 'team_ids', '[]'::jsonb))
                  )
                )
                or p.team_id::text = coalesce(v_template.assign_config ->> 'team_id', '')
                or p.sector_code = any (
                  array(
                    select value
                    from jsonb_array_elements_text(coalesce(v_template.assign_config -> 'sector_codes', '[]'::jsonb))
                  )
                )
                or p.sector_code = coalesce(v_template.assign_config ->> 'sector_code', '')
              )
            )
          )
      )
      select *
      from resolved_profiles
    loop
      for v_candidate_date in
        select generated_date::date
        from generate_series(v_window_start, v_horizon_date, interval '1 day') as generated_date
      loop
        if v_template.recurrence_type = 'DAILY' then
          null;
        elsif v_template.recurrence_type = 'WEEKDAYS' and extract(isodow from v_candidate_date) not between 1 and 5 then
          continue;
        elsif v_template.recurrence_type = 'WEEKLY' then
          if coalesce(jsonb_array_length(v_template.recurrence_config -> 'weekdays'), 0) = 0 then
            if extract(isodow from v_candidate_date) <> extract(isodow from v_anchor_date) then
              continue;
            end if;
          elsif trim(to_char(v_candidate_date, 'DY')) not in (
            select upper(value)
            from jsonb_array_elements_text(coalesce(v_template.recurrence_config -> 'weekdays', '[]'::jsonb))
          ) then
            continue;
          end if;
        elsif v_template.recurrence_type = 'MONTHLY' then
          if extract(day from v_candidate_date) <> coalesce(nullif(v_template.recurrence_config ->> 'day_of_month', '')::int, extract(day from v_anchor_date)::int) then
            continue;
          end if;
        else
          continue;
        end if;

        v_due_at := ((v_candidate_date::text || ' ' || v_due_time)::timestamp)::timestamptz;
        v_recurrence_key := concat(v_template.id::text, ':', v_assignee.id::text, ':', to_char(v_candidate_date, 'YYYY-MM-DD'));

        if exists (
          select 1
          from public.task_instances ti
          where ti.recurrence_key = v_recurrence_key
        ) then
          continue;
        end if;

        if v_template.generate_only_if_previous_closed and exists (
          select 1
          from public.task_instances ti
          where ti.template_id = v_template.id
            and ti.assigned_to = v_assignee.id
            and ti.status not in ('CONCLUIDO', 'CANCELADO', 'ARQUIVADO')
            and coalesce(ti.due_at, ti.created_at) < v_due_at
        ) then
          continue;
        end if;

        if not v_template.is_accumulative then
          for v_open_instance_id in
            select ti.id
            from public.task_instances ti
            where ti.template_id = v_template.id
              and ti.assigned_to = v_assignee.id
              and ti.status not in ('CONCLUIDO', 'CANCELADO', 'ARQUIVADO')
              and coalesce(ti.due_at, ti.created_at) < v_due_at
          loop
            update public.task_instances
            set status = 'ARQUIVADO'
            where id = v_open_instance_id;

            insert into public.task_activity_logs (
              task_instance_id,
              action,
              actor_id,
              note,
              new_value
            )
            values (
              v_open_instance_id,
              'AUTO_ARCHIVED_BY_RECURRENCE',
              v_template.created_by,
              'Instancia arquivada automaticamente para evitar poluicao visual.',
              jsonb_build_object('status', 'ARQUIVADO')
            );

            v_archived_count := v_archived_count + 1;
          end loop;
        end if;

        insert into public.task_instances (
          template_id,
          source_type,
          source_id,
          title,
          description,
          category,
          assigned_to,
          assigned_by,
          visibility_scope,
          priority,
          due_at,
          starts_at,
          status,
          is_recurring_instance,
          is_accumulated,
          metadata,
          recurrence_key
        )
        values (
          v_template.id,
          'TASK_INTERNAL',
          null,
          v_template.title,
          v_template.description,
          v_template.category,
          v_assignee.id,
          v_template.created_by,
          v_visibility_scope,
          v_template.default_priority,
          v_due_at,
          v_due_at,
          case when v_due_at < p_reference then 'ATRASADO' else 'PENDENTE' end,
          true,
          v_template.is_accumulative,
          jsonb_build_object(
            'generated_from_template', true,
            'task_scope', v_template.task_scope,
            'assign_mode', v_template.assign_mode,
            'reference_date', to_char(v_candidate_date, 'YYYY-MM-DD')
          ),
          v_recurrence_key
        )
        on conflict (recurrence_key) do nothing;

        if found then
          insert into public.task_activity_logs (
            task_instance_id,
            action,
            actor_id,
            note,
            new_value
          )
          select
            ti.id,
            'RECURRENCE_GENERATED',
            v_template.created_by,
            'Instancia recorrente gerada automaticamente.',
            jsonb_build_object('due_at', ti.due_at, 'assigned_to', ti.assigned_to)
          from public.task_instances ti
          where ti.recurrence_key = v_recurrence_key;

          v_created_count := v_created_count + 1;
        end if;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object(
    'created', v_created_count,
    'archived', v_archived_count,
    'reference_date', v_reference_date,
    'horizon_date', v_horizon_date
  );
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_notifications'
    ) then
      alter publication supabase_realtime add table public.user_notifications;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'task_instances'
    ) then
      alter publication supabase_realtime add table public.task_instances;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'call_schedules'
    ) then
      alter publication supabase_realtime add table public.call_schedules;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'protocols'
    ) then
      alter publication supabase_realtime add table public.protocols;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'visits'
    ) then
      alter publication supabase_realtime add table public.visits;
    end if;
  end if;
end;
$$;

create table if not exists public.task_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_task_lists_owner_name_unique
  on public.task_lists(owner_user_id, lower(name));

drop trigger if exists trg_task_lists_updated_at on public.task_lists;
create trigger trg_task_lists_updated_at
before update on public.task_lists
for each row execute function public.set_timestamp();

alter table public.clients
  add column if not exists customer_profiles text[] not null default '{}',
  add column if not exists product_categories text[] not null default '{}',
  add column if not exists equipment_models text[] not null default '{}',
  add column if not exists portfolio_entries jsonb not null default '[]'::jsonb;

update public.clients
set equipment_models = case
  when coalesce(array_length(equipment_models, 1), 0) = 0 then coalesce(items, '{}')
  else equipment_models
end
where coalesce(array_length(items, 1), 0) > 0
   or coalesce(array_length(equipment_models, 1), 0) > 0;

create index if not exists idx_clients_customer_profiles_gin
  on public.clients
  using gin (customer_profiles);

create index if not exists idx_clients_product_categories_gin
  on public.clients
  using gin (product_categories);

create index if not exists idx_clients_equipment_models_gin
  on public.clients
  using gin (equipment_models);

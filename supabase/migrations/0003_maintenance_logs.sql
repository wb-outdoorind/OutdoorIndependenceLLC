-- 0003_maintenance_logs.sql
-- Maintenance logs persisted in Supabase (vehicle_id uses text to match vehicles.id text)

create extension if not exists pgcrypto;

create table if not exists public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  vehicle_id text not null,
  request_id uuid null references public.maintenance_requests(id) on delete set null,

  mileage integer,
  notes text,
  status_update text,

  created_by uuid not null default auth.uid()
);

-- If vehicles.id exists and is text, enforce FK to vehicles.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicles'
      and column_name = 'id'
      and data_type = 'text'
  ) then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'maintenance_logs_vehicle_id_fkey'
    ) then
      alter table public.maintenance_logs
        add constraint maintenance_logs_vehicle_id_fkey
        foreign key (vehicle_id) references public.vehicles(id) on delete cascade;
    end if;
  end if;
end
$$;

create index if not exists maintenance_logs_vehicle_id_idx
  on public.maintenance_logs (vehicle_id);

create index if not exists maintenance_logs_request_id_idx
  on public.maintenance_logs (request_id);

create index if not exists maintenance_logs_created_at_idx
  on public.maintenance_logs (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maintenance_logs_updated_at on public.maintenance_logs;
create trigger set_maintenance_logs_updated_at
before update on public.maintenance_logs
for each row
execute function public.set_updated_at();

alter table public.maintenance_logs enable row level security;

-- Authenticated users can read maintenance logs.
drop policy if exists maintenance_logs_select_authenticated on public.maintenance_logs;
create policy maintenance_logs_select_authenticated
  on public.maintenance_logs
  for select
  to authenticated
  using (true);

-- Authenticated users can insert logs for themselves.
drop policy if exists maintenance_logs_insert_own on public.maintenance_logs;
create policy maintenance_logs_insert_own
  on public.maintenance_logs
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Preferred: only owner / office_admin / mechanic can update.
-- Requires public.profiles with role text keyed by auth user id.
drop policy if exists maintenance_logs_update_role_based on public.maintenance_logs;
create policy maintenance_logs_update_role_based
  on public.maintenance_logs
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin', 'mechanic')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin', 'mechanic')
    )
  );

-- Temporary fallback (only if profiles table/role is unavailable):
-- create policy maintenance_logs_update_temp_authenticated
--   on public.maintenance_logs
--   for update
--   to authenticated
--   using (true)
--   with check (true);

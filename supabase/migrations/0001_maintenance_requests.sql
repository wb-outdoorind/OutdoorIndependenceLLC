-- 0001_maintenance_requests.sql
-- Maintenance requests persisted in Supabase (vehicle_id uses text to match vehicles.id text)

create extension if not exists pgcrypto;

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  vehicle_id text not null,
  status text not null default 'Open',

  urgency text,
  system_affected text,
  drivability text,
  unit_status text,
  issue_identified_during text,
  description text,

  created_by uuid not null default auth.uid(),

  constraint maintenance_requests_status_check
    check (status in ('Open', 'In Progress', 'Closed'))
);

-- If vehicles.id exists and is text, enforce FK to fleet vehicles.
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
      where conname = 'maintenance_requests_vehicle_id_fkey'
  ) then
      alter table public.maintenance_requests
        add constraint maintenance_requests_vehicle_id_fkey
        foreign key (vehicle_id) references public.vehicles(id) on delete cascade;
    end if;
  end if;
end
$$;

create index if not exists maintenance_requests_vehicle_id_idx
  on public.maintenance_requests (vehicle_id);

create index if not exists maintenance_requests_created_at_idx
  on public.maintenance_requests (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maintenance_requests_updated_at on public.maintenance_requests;
create trigger set_maintenance_requests_updated_at
before update on public.maintenance_requests
for each row
execute function public.set_updated_at();

alter table public.maintenance_requests enable row level security;

-- Fleet visibility for authenticated users.
drop policy if exists maintenance_requests_select_authenticated on public.maintenance_requests;
create policy maintenance_requests_select_authenticated
  on public.maintenance_requests
  for select
  to authenticated
  using (true);

-- Authenticated users can create requests for themselves.
drop policy if exists maintenance_requests_insert_own on public.maintenance_requests;
create policy maintenance_requests_insert_own
  on public.maintenance_requests
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Preferred: only owner / office_admin can update.
-- Requires public.profiles with role text keyed by auth user id.
drop policy if exists maintenance_requests_update_admin on public.maintenance_requests;
create policy maintenance_requests_update_admin
  on public.maintenance_requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin')
    )
  );

-- Temporary fallback (only if profiles table/role is unavailable):
-- create policy maintenance_requests_update_temp_authenticated
--   on public.maintenance_requests
--   for update
--   to authenticated
--   using (true)
--   with check (true);

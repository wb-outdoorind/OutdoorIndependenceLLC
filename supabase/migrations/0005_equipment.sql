-- 0005_equipment.sql
-- Core equipment table (id is text slug; external spreadsheet id stored separately)

create extension if not exists pgcrypto;

create table if not exists public.equipment (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  external_id text,
  name text not null,
  equipment_type text,
  make text,
  model text,
  year integer,
  serial_number text,
  license_plate text,
  fuel_type text,
  current_hours integer,
  status text,
  asset_qr text unique
);

create index if not exists equipment_name_idx
  on public.equipment (name);

create index if not exists equipment_type_idx
  on public.equipment (equipment_type);

create index if not exists equipment_status_idx
  on public.equipment (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_equipment_updated_at on public.equipment;
create trigger set_equipment_updated_at
before update on public.equipment
for each row
execute function public.set_updated_at();

alter table public.equipment enable row level security;

drop policy if exists equipment_select_authenticated on public.equipment;
create policy equipment_select_authenticated
  on public.equipment
  for select
  to authenticated
  using (true);

-- Preferred: only owner / office_admin can insert.
-- Requires public.profiles with role text keyed by auth user id.
drop policy if exists equipment_insert_role_based on public.equipment;
create policy equipment_insert_role_based
  on public.equipment
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin')
    )
  );

-- Preferred: only owner / office_admin can update.
-- Requires public.profiles with role text keyed by auth user id.
drop policy if exists equipment_update_role_based on public.equipment;
create policy equipment_update_role_based
  on public.equipment
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
-- create policy equipment_insert_temp_authenticated
--   on public.equipment
--   for insert
--   to authenticated
--   with check (true);
--
-- create policy equipment_update_temp_authenticated
--   on public.equipment
--   for update
--   to authenticated
--   using (true)
--   with check (true);

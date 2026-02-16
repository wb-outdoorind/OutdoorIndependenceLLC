-- 0004_inspections.sql
-- Inspections persisted in Supabase (single table for pre-trip and post-trip)

create extension if not exists pgcrypto;

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  vehicle_id text not null,
  inspection_type text not null,
  checklist jsonb not null default '{}'::jsonb,
  overall_status text,
  mileage integer,

  created_by uuid not null default auth.uid(),

  constraint inspections_type_check
    check (inspection_type in ('Pre-Trip', 'Post-Trip'))
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
      where conname = 'inspections_vehicle_id_fkey'
    ) then
      alter table public.inspections
        add constraint inspections_vehicle_id_fkey
        foreign key (vehicle_id) references public.vehicles(id) on delete cascade;
    end if;
  end if;
end
$$;

create index if not exists inspections_vehicle_id_idx
  on public.inspections (vehicle_id);

create index if not exists inspections_type_idx
  on public.inspections (inspection_type);

create index if not exists inspections_created_at_idx
  on public.inspections (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_inspections_updated_at on public.inspections;
create trigger set_inspections_updated_at
before update on public.inspections
for each row
execute function public.set_updated_at();

alter table public.inspections enable row level security;

drop policy if exists inspections_select_authenticated on public.inspections;
create policy inspections_select_authenticated
  on public.inspections
  for select
  to authenticated
  using (true);

drop policy if exists inspections_insert_own on public.inspections;
create policy inspections_insert_own
  on public.inspections
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Preferred: only owner / office_admin can update.
-- Requires public.profiles with role text keyed by auth user id.
drop policy if exists inspections_update_owner_office_admin on public.inspections;
create policy inspections_update_owner_office_admin
  on public.inspections
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
-- create policy inspections_update_temp_authenticated
--   on public.inspections
--   for update
--   to authenticated
--   using (true)
--   with check (true);

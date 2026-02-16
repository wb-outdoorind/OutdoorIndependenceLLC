-- 0006_equipment_maintenance.sql
-- Equipment maintenance requests + logs (separate from vehicle maintenance tables)

create extension if not exists pgcrypto;

create table if not exists public.equipment_maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  equipment_id text not null references public.equipment(id) on delete cascade,
  status text not null default 'Open',
  urgency text,
  system_affected text,
  drivability text,
  unit_status text,
  issue_identified_during text,
  description text,

  created_by uuid not null default auth.uid(),

  constraint equipment_maintenance_requests_status_check
    check (status in ('Open', 'In Progress', 'Closed'))
);

create table if not exists public.equipment_maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  equipment_id text not null references public.equipment(id) on delete cascade,
  request_id uuid null references public.equipment_maintenance_requests(id) on delete set null,
  hours integer,
  notes text,
  status_update text,

  created_by uuid not null default auth.uid()
);

create index if not exists equipment_maintenance_requests_equipment_id_idx
  on public.equipment_maintenance_requests (equipment_id);

create index if not exists equipment_maintenance_requests_created_at_idx
  on public.equipment_maintenance_requests (created_at desc);

create index if not exists equipment_maintenance_logs_equipment_id_idx
  on public.equipment_maintenance_logs (equipment_id);

create index if not exists equipment_maintenance_logs_request_id_idx
  on public.equipment_maintenance_logs (request_id);

create index if not exists equipment_maintenance_logs_created_at_idx
  on public.equipment_maintenance_logs (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_equipment_maintenance_requests_updated_at on public.equipment_maintenance_requests;
create trigger set_equipment_maintenance_requests_updated_at
before update on public.equipment_maintenance_requests
for each row
execute function public.set_updated_at();

drop trigger if exists set_equipment_maintenance_logs_updated_at on public.equipment_maintenance_logs;
create trigger set_equipment_maintenance_logs_updated_at
before update on public.equipment_maintenance_logs
for each row
execute function public.set_updated_at();

alter table public.equipment_maintenance_requests enable row level security;
alter table public.equipment_maintenance_logs enable row level security;

drop policy if exists equipment_maintenance_requests_select_authenticated on public.equipment_maintenance_requests;
create policy equipment_maintenance_requests_select_authenticated
  on public.equipment_maintenance_requests
  for select
  to authenticated
  using (true);

drop policy if exists equipment_maintenance_logs_select_authenticated on public.equipment_maintenance_logs;
create policy equipment_maintenance_logs_select_authenticated
  on public.equipment_maintenance_logs
  for select
  to authenticated
  using (true);

drop policy if exists equipment_maintenance_requests_insert_own on public.equipment_maintenance_requests;
create policy equipment_maintenance_requests_insert_own
  on public.equipment_maintenance_requests
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists equipment_maintenance_logs_insert_own on public.equipment_maintenance_logs;
create policy equipment_maintenance_logs_insert_own
  on public.equipment_maintenance_logs
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Preferred: only owner / office_admin / mechanic can update.
-- Requires public.profiles with role text keyed by auth user id.
drop policy if exists equipment_maintenance_requests_update_role_based on public.equipment_maintenance_requests;
create policy equipment_maintenance_requests_update_role_based
  on public.equipment_maintenance_requests
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

drop policy if exists equipment_maintenance_logs_update_role_based on public.equipment_maintenance_logs;
create policy equipment_maintenance_logs_update_role_based
  on public.equipment_maintenance_logs
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
-- create policy equipment_maintenance_requests_update_temp_authenticated
--   on public.equipment_maintenance_requests
--   for update
--   to authenticated
--   using (true)
--   with check (true);
--
-- create policy equipment_maintenance_logs_update_temp_authenticated
--   on public.equipment_maintenance_logs
--   for update
--   to authenticated
--   using (true)
--   with check (true);

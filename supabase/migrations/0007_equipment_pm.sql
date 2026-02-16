-- 0007_equipment_pm.sql
-- Equipment PM templates (type-based) and PM events

create extension if not exists pgcrypto;

create table if not exists public.equipment_pm_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  equipment_type text not null,
  name text not null,
  checklist jsonb not null default '{}'::jsonb,
  is_active boolean not null default true
);

create table if not exists public.equipment_pm_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  equipment_id text not null references public.equipment(id) on delete cascade,
  template_id uuid null references public.equipment_pm_templates(id) on delete set null,
  hours integer,
  notes text,
  result jsonb not null default '{}'::jsonb,

  created_by uuid not null default auth.uid()
);

create index if not exists equipment_pm_templates_type_idx
  on public.equipment_pm_templates (equipment_type);

create index if not exists equipment_pm_templates_active_idx
  on public.equipment_pm_templates (is_active);

create index if not exists equipment_pm_events_equipment_id_idx
  on public.equipment_pm_events (equipment_id);

create index if not exists equipment_pm_events_template_id_idx
  on public.equipment_pm_events (template_id);

create index if not exists equipment_pm_events_created_at_idx
  on public.equipment_pm_events (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_equipment_pm_templates_updated_at on public.equipment_pm_templates;
create trigger set_equipment_pm_templates_updated_at
before update on public.equipment_pm_templates
for each row
execute function public.set_updated_at();

drop trigger if exists set_equipment_pm_events_updated_at on public.equipment_pm_events;
create trigger set_equipment_pm_events_updated_at
before update on public.equipment_pm_events
for each row
execute function public.set_updated_at();

alter table public.equipment_pm_templates enable row level security;
alter table public.equipment_pm_events enable row level security;

drop policy if exists equipment_pm_templates_select_authenticated on public.equipment_pm_templates;
create policy equipment_pm_templates_select_authenticated
  on public.equipment_pm_templates
  for select
  to authenticated
  using (true);

drop policy if exists equipment_pm_events_select_authenticated on public.equipment_pm_events;
create policy equipment_pm_events_select_authenticated
  on public.equipment_pm_events
  for select
  to authenticated
  using (true);

drop policy if exists equipment_pm_templates_insert_authenticated on public.equipment_pm_templates;
create policy equipment_pm_templates_insert_authenticated
  on public.equipment_pm_templates
  for insert
  to authenticated
  with check (true);

drop policy if exists equipment_pm_events_insert_authenticated on public.equipment_pm_events;
create policy equipment_pm_events_insert_authenticated
  on public.equipment_pm_events
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Preferred: only owner / office_admin / mechanic can update.
-- Requires public.profiles with role text keyed by auth user id.
drop policy if exists equipment_pm_templates_update_role_based on public.equipment_pm_templates;
create policy equipment_pm_templates_update_role_based
  on public.equipment_pm_templates
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

drop policy if exists equipment_pm_events_update_role_based on public.equipment_pm_events;
create policy equipment_pm_events_update_role_based
  on public.equipment_pm_events
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
-- create policy equipment_pm_templates_update_temp_authenticated
--   on public.equipment_pm_templates
--   for update
--   to authenticated
--   using (true)
--   with check (true);
--
-- create policy equipment_pm_events_update_temp_authenticated
--   on public.equipment_pm_events
--   for update
--   to authenticated
--   using (true)
--   with check (true);

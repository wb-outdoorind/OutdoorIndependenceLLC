-- 0037_vehicle_pm_events.sql
-- Persist vehicle preventative maintenance events in Supabase (cross-device),
-- replacing local-only browser storage for PM history/ops views.

create table if not exists public.vehicle_pm_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id text not null references public.vehicles(id) on delete cascade,
  created_at timestamptz not null default now(),
  mileage integer not null check (mileage >= 0),
  notes text null,
  result jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id)
);

create index if not exists vehicle_pm_events_vehicle_id_idx
  on public.vehicle_pm_events(vehicle_id);

create index if not exists vehicle_pm_events_created_at_idx
  on public.vehicle_pm_events(created_at desc);

alter table public.vehicle_pm_events enable row level security;

drop policy if exists vehicle_pm_events_select_authenticated on public.vehicle_pm_events;
create policy vehicle_pm_events_select_authenticated
  on public.vehicle_pm_events
  for select
  to authenticated
  using (true);

drop policy if exists vehicle_pm_events_insert_authenticated on public.vehicle_pm_events;
create policy vehicle_pm_events_insert_authenticated
  on public.vehicle_pm_events
  for insert
  to authenticated
  with check (created_by is null or created_by = auth.uid());

drop policy if exists vehicle_pm_events_update_authenticated on public.vehicle_pm_events;
create policy vehicle_pm_events_update_authenticated
  on public.vehicle_pm_events
  for update
  to authenticated
  using (created_by is null or created_by = auth.uid())
  with check (created_by is null or created_by = auth.uid());

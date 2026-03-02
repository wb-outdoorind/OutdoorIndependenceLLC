-- 0038_vehicle_inspection_drafts.sql
-- Persist pre/post trip inspection drafts per user and vehicle for cross-device resume.

create table if not exists public.vehicle_inspection_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id text not null references public.vehicles(id) on delete cascade,
  inspection_type text not null check (inspection_type in ('pre-trip', 'post-trip')),
  draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vehicle_id, inspection_type)
);

create index if not exists vehicle_inspection_drafts_user_vehicle_idx
  on public.vehicle_inspection_drafts(user_id, vehicle_id, inspection_type);

create or replace function public.touch_vehicle_inspection_drafts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vehicle_inspection_drafts_updated_at on public.vehicle_inspection_drafts;
create trigger trg_vehicle_inspection_drafts_updated_at
before update on public.vehicle_inspection_drafts
for each row
execute function public.touch_vehicle_inspection_drafts_updated_at();

alter table public.vehicle_inspection_drafts enable row level security;

drop policy if exists vehicle_inspection_drafts_select_self on public.vehicle_inspection_drafts;
create policy vehicle_inspection_drafts_select_self
  on public.vehicle_inspection_drafts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists vehicle_inspection_drafts_insert_self on public.vehicle_inspection_drafts;
create policy vehicle_inspection_drafts_insert_self
  on public.vehicle_inspection_drafts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists vehicle_inspection_drafts_update_self on public.vehicle_inspection_drafts;
create policy vehicle_inspection_drafts_update_self
  on public.vehicle_inspection_drafts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists vehicle_inspection_drafts_delete_self on public.vehicle_inspection_drafts;
create policy vehicle_inspection_drafts_delete_self
  on public.vehicle_inspection_drafts
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 0042_pm_waivers.sql
-- Track per-asset PM waivers for a specific due cycle.

create table if not exists public.pm_waivers (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null check (asset_type in ('vehicle', 'equipment')),
  asset_id text not null,
  due_at integer not null check (due_at >= 0),
  active boolean not null default true,
  waived_by uuid null references public.profiles(id) on delete set null,
  waived_at timestamptz not null default now(),
  reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pm_waivers_asset_id_not_blank check (char_length(trim(asset_id)) > 0),
  constraint pm_waivers_asset_due_unique unique (asset_type, asset_id, due_at)
);

create index if not exists pm_waivers_active_asset_idx
  on public.pm_waivers (active, asset_type, asset_id, due_at);

create index if not exists pm_waivers_updated_at_idx
  on public.pm_waivers (updated_at desc);

alter table if exists public.pm_waivers enable row level security;

drop policy if exists pm_waivers_select_authenticated on public.pm_waivers;
create policy pm_waivers_select_authenticated
  on public.pm_waivers
  for select
  to authenticated
  using (true);

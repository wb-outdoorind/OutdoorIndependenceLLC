create table if not exists public.trend_actions (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null check (asset_type in ('vehicle', 'equipment')),
  asset_id text not null,
  action_type text not null check (action_type in ('asset_health_decline', 'mechanic_decline')),
  status text not null default 'Open' check (status in ('Open', 'In Review', 'Resolved')),
  trend_direction text not null default 'Declining',
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists trend_actions_asset_idx
  on public.trend_actions (asset_type, asset_id, created_at desc);

create unique index if not exists trend_actions_open_unique_idx
  on public.trend_actions (asset_type, asset_id, action_type)
  where status in ('Open', 'In Review');

alter table public.trend_actions enable row level security;

drop policy if exists trend_actions_select_owner_mechanic on public.trend_actions;
create policy trend_actions_select_owner_mechanic
  on public.trend_actions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'mechanic')
    )
  );

drop policy if exists trend_actions_insert_owner_mechanic on public.trend_actions;
create policy trend_actions_insert_owner_mechanic
  on public.trend_actions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'mechanic')
    )
  );

drop policy if exists trend_actions_update_owner_mechanic on public.trend_actions;
create policy trend_actions_update_owner_mechanic
  on public.trend_actions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'mechanic')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'mechanic')
    )
  );

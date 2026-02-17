-- 0011_inventory_low_stock_alerts.sql
-- Low-stock email subscription and per-item alert state.

create extension if not exists pgcrypto;

create table if not exists public.inventory_low_stock_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique,
  is_enabled boolean not null default true
);

create table if not exists public.inventory_low_stock_state (
  item_id text primary key references public.inventory_items(id) on delete cascade,
  is_low boolean not null default false,
  first_low_at timestamptz,
  last_threshold_email_at timestamptz,
  last_daily_digest_at date
);

create index if not exists inventory_low_stock_subscriptions_email_idx
  on public.inventory_low_stock_subscriptions (email);

create index if not exists inventory_low_stock_subscriptions_is_enabled_idx
  on public.inventory_low_stock_subscriptions (is_enabled);

create index if not exists inventory_low_stock_state_is_low_idx
  on public.inventory_low_stock_state (is_low);

alter table public.inventory_low_stock_subscriptions enable row level security;
alter table public.inventory_low_stock_state enable row level security;

drop policy if exists inventory_low_stock_subscriptions_select_authenticated on public.inventory_low_stock_subscriptions;
create policy inventory_low_stock_subscriptions_select_authenticated
  on public.inventory_low_stock_subscriptions
  for select
  to authenticated
  using (true);

drop policy if exists inventory_low_stock_state_select_authenticated on public.inventory_low_stock_state;
create policy inventory_low_stock_state_select_authenticated
  on public.inventory_low_stock_state
  for select
  to authenticated
  using (true);

drop policy if exists inventory_low_stock_subscriptions_insert_role_based on public.inventory_low_stock_subscriptions;
create policy inventory_low_stock_subscriptions_insert_role_based
  on public.inventory_low_stock_subscriptions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin', 'mechanic')
    )
  );

drop policy if exists inventory_low_stock_subscriptions_update_role_based on public.inventory_low_stock_subscriptions;
create policy inventory_low_stock_subscriptions_update_role_based
  on public.inventory_low_stock_subscriptions
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

drop policy if exists inventory_low_stock_subscriptions_delete_role_based on public.inventory_low_stock_subscriptions;
create policy inventory_low_stock_subscriptions_delete_role_based
  on public.inventory_low_stock_subscriptions
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin', 'mechanic')
    )
  );

drop policy if exists inventory_low_stock_state_insert_role_based on public.inventory_low_stock_state;
create policy inventory_low_stock_state_insert_role_based
  on public.inventory_low_stock_state
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin', 'mechanic')
    )
  );

drop policy if exists inventory_low_stock_state_update_role_based on public.inventory_low_stock_state;
create policy inventory_low_stock_state_update_role_based
  on public.inventory_low_stock_state
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

drop policy if exists inventory_low_stock_state_delete_role_based on public.inventory_low_stock_state;
create policy inventory_low_stock_state_delete_role_based
  on public.inventory_low_stock_state
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin', 'mechanic')
    )
  );

insert into public.inventory_low_stock_subscriptions (email, is_enabled)
values ('wb@outdoorind.org', true)
on conflict (email)
do update set is_enabled = excluded.is_enabled;

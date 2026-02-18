-- 0012_inventory_low_stock_state.sql
-- Track low-stock email state per inventory item.

create table if not exists public.inventory_low_stock_state (
  item_id text primary key references public.inventory_items(id) on delete cascade,
  is_low boolean not null default false,
  first_low_at timestamptz null,
  last_threshold_email_at timestamptz null,
  last_daily_digest_local_date date null,
  updated_at timestamptz not null default now()
);

alter table public.inventory_low_stock_state
  add column if not exists is_low boolean not null default false;

alter table public.inventory_low_stock_state
  add column if not exists first_low_at timestamptz null;

alter table public.inventory_low_stock_state
  add column if not exists last_threshold_email_at timestamptz null;

alter table public.inventory_low_stock_state
  add column if not exists last_daily_digest_local_date date null;

alter table public.inventory_low_stock_state
  add column if not exists updated_at timestamptz not null default now();

alter table public.inventory_low_stock_state enable row level security;

drop policy if exists inventory_low_stock_state_select_authenticated on public.inventory_low_stock_state;
create policy inventory_low_stock_state_select_authenticated
  on public.inventory_low_stock_state
  for select
  to authenticated
  using (true);

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

-- Per-user permission overrides and permission-aware RLS policies

-- Shared updated_at trigger function (safe to replace)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Permission overrides table
create table if not exists public.user_permission_overrides (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  allow jsonb not null default '{}'::jsonb,
  deny jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep columns aligned if table already existed with drift
alter table if exists public.user_permission_overrides
  add column if not exists allow jsonb not null default '{}'::jsonb,
  add column if not exists deny jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- updated_at trigger

drop trigger if exists trg_user_permission_overrides_updated_at on public.user_permission_overrides;
create trigger trg_user_permission_overrides_updated_at
before update on public.user_permission_overrides
for each row
execute function public.set_updated_at();

-- Permission resolver
create or replace function public.has_permission(p_user_id uuid, p_perm text)
returns boolean
language plpgsql
stable
as $$
declare
  v_role text;
  v_allow jsonb := '{}'::jsonb;
  v_deny jsonb := '{}'::jsonb;
  v_preset boolean := false;
begin
  if p_user_id is null or p_perm is null or btrim(p_perm) = '' then
    return false;
  end if;

  select role
  into v_role
  from public.profiles
  where id = p_user_id;

  v_role := coalesce(v_role, 'employee');

  -- Role presets
  if v_role = 'employee' then
    v_preset := p_perm in ('vehicles.view', 'equipment.view', 'maintenance.view');

  elsif v_role = 'mechanic' then
    v_preset := p_perm in (
      'vehicles.view',
      'equipment.view',
      'maintenance.view',
      'inventory.view',
      'ops.view',
      'maintenance.manage',
      'inventory.manage'
    );

  elsif v_role in ('office_admin', 'owner') then
    v_preset := p_perm in (
      -- view
      'vehicles.view',
      'equipment.view',
      'maintenance.view',
      'inventory.view',
      'employees.view',
      'ops.view',
      -- manage
      'vehicles.manage',
      'equipment.manage',
      'maintenance.manage',
      'inventory.manage',
      'employees.manage'
    );
  else
    v_preset := false;
  end if;

  -- Optional per-user overrides
  select coalesce(allow, '{}'::jsonb), coalesce(deny, '{}'::jsonb)
  into v_allow, v_deny
  from public.user_permission_overrides
  where user_id = p_user_id;

  -- deny wins
  if jsonb_typeof(v_deny -> p_perm) = 'boolean' and (v_deny ->> p_perm) = 'true' then
    return false;
  end if;

  if jsonb_typeof(v_allow -> p_perm) = 'boolean' and (v_allow ->> p_perm) = 'true' then
    return true;
  end if;

  return coalesce(v_preset, false);
end;
$$;

-- RLS for overrides table
alter table if exists public.user_permission_overrides enable row level security;

-- Recreate policies idempotently
DO $$
begin
  if to_regclass('public.user_permission_overrides') is null then
    return;
  end if;

  drop policy if exists user_permission_overrides_select_own on public.user_permission_overrides;
  create policy user_permission_overrides_select_own
    on public.user_permission_overrides
    for select
    to authenticated
    using (auth.uid() = user_id);

  -- Self-edit disabled by default: auth.uid() <> user_id
  drop policy if exists user_permission_overrides_insert_manage_others on public.user_permission_overrides;
  create policy user_permission_overrides_insert_manage_others
    on public.user_permission_overrides
    for insert
    to authenticated
    with check (
      auth.uid() <> user_id
      and public.has_permission(auth.uid(), 'employees.manage')
    );

  drop policy if exists user_permission_overrides_update_manage_others on public.user_permission_overrides;
  create policy user_permission_overrides_update_manage_others
    on public.user_permission_overrides
    for update
    to authenticated
    using (
      auth.uid() <> user_id
      and public.has_permission(auth.uid(), 'employees.manage')
    )
    with check (
      auth.uid() <> user_id
      and public.has_permission(auth.uid(), 'employees.manage')
    );

  drop policy if exists user_permission_overrides_delete_manage_others on public.user_permission_overrides;
  create policy user_permission_overrides_delete_manage_others
    on public.user_permission_overrides
    for delete
    to authenticated
    using (
      auth.uid() <> user_id
      and public.has_permission(auth.uid(), 'employees.manage')
    );
end
$$;

-- Inventory tables: keep SELECT to authenticated, manage via inventory.manage
DO $$
begin
  -- inventory_items
  if to_regclass('public.inventory_items') is not null then
    alter table public.inventory_items enable row level security;

    drop policy if exists inventory_items_select_authenticated on public.inventory_items;
    create policy inventory_items_select_authenticated
      on public.inventory_items
      for select
      to authenticated
      using (true);

    drop policy if exists inventory_items_insert_manage on public.inventory_items;
    create policy inventory_items_insert_manage
      on public.inventory_items
      for insert
      to authenticated
      with check (public.has_permission(auth.uid(), 'inventory.manage'));

    drop policy if exists inventory_items_update_manage on public.inventory_items;
    create policy inventory_items_update_manage
      on public.inventory_items
      for update
      to authenticated
      using (public.has_permission(auth.uid(), 'inventory.manage'))
      with check (public.has_permission(auth.uid(), 'inventory.manage'));

    drop policy if exists inventory_items_delete_manage on public.inventory_items;
    create policy inventory_items_delete_manage
      on public.inventory_items
      for delete
      to authenticated
      using (public.has_permission(auth.uid(), 'inventory.manage'));
  end if;

  -- inventory_locations
  if to_regclass('public.inventory_locations') is not null then
    alter table public.inventory_locations enable row level security;

    drop policy if exists inventory_locations_select_authenticated on public.inventory_locations;
    create policy inventory_locations_select_authenticated
      on public.inventory_locations
      for select
      to authenticated
      using (true);

    drop policy if exists inventory_locations_insert_manage on public.inventory_locations;
    create policy inventory_locations_insert_manage
      on public.inventory_locations
      for insert
      to authenticated
      with check (public.has_permission(auth.uid(), 'inventory.manage'));

    drop policy if exists inventory_locations_update_manage on public.inventory_locations;
    create policy inventory_locations_update_manage
      on public.inventory_locations
      for update
      to authenticated
      using (public.has_permission(auth.uid(), 'inventory.manage'))
      with check (public.has_permission(auth.uid(), 'inventory.manage'));

    drop policy if exists inventory_locations_delete_manage on public.inventory_locations;
    create policy inventory_locations_delete_manage
      on public.inventory_locations
      for delete
      to authenticated
      using (public.has_permission(auth.uid(), 'inventory.manage'));
  end if;

  -- inventory_transactions
  if to_regclass('public.inventory_transactions') is not null then
    alter table public.inventory_transactions enable row level security;

    drop policy if exists inventory_transactions_select_authenticated on public.inventory_transactions;
    create policy inventory_transactions_select_authenticated
      on public.inventory_transactions
      for select
      to authenticated
      using (true);

    drop policy if exists inventory_transactions_insert_manage on public.inventory_transactions;
    create policy inventory_transactions_insert_manage
      on public.inventory_transactions
      for insert
      to authenticated
      with check (public.has_permission(auth.uid(), 'inventory.manage'));

    drop policy if exists inventory_transactions_update_manage on public.inventory_transactions;
    create policy inventory_transactions_update_manage
      on public.inventory_transactions
      for update
      to authenticated
      using (public.has_permission(auth.uid(), 'inventory.manage'))
      with check (public.has_permission(auth.uid(), 'inventory.manage'));

    drop policy if exists inventory_transactions_delete_manage on public.inventory_transactions;
    create policy inventory_transactions_delete_manage
      on public.inventory_transactions
      for delete
      to authenticated
      using (public.has_permission(auth.uid(), 'inventory.manage'));
  end if;
end
$$;

-- Maintenance tables: keep SELECT to authenticated, insert/update via maintenance.manage
DO $$
begin
  if to_regclass('public.maintenance_requests') is not null then
    alter table public.maintenance_requests enable row level security;

    drop policy if exists maintenance_requests_select_authenticated on public.maintenance_requests;
    create policy maintenance_requests_select_authenticated
      on public.maintenance_requests
      for select
      to authenticated
      using (true);

    drop policy if exists maintenance_requests_insert_manage on public.maintenance_requests;
    create policy maintenance_requests_insert_manage
      on public.maintenance_requests
      for insert
      to authenticated
      with check (public.has_permission(auth.uid(), 'maintenance.manage'));

    drop policy if exists maintenance_requests_update_manage on public.maintenance_requests;
    create policy maintenance_requests_update_manage
      on public.maintenance_requests
      for update
      to authenticated
      using (public.has_permission(auth.uid(), 'maintenance.manage'))
      with check (public.has_permission(auth.uid(), 'maintenance.manage'));
  end if;

  if to_regclass('public.maintenance_logs') is not null then
    alter table public.maintenance_logs enable row level security;

    drop policy if exists maintenance_logs_select_authenticated on public.maintenance_logs;
    create policy maintenance_logs_select_authenticated
      on public.maintenance_logs
      for select
      to authenticated
      using (true);

    drop policy if exists maintenance_logs_insert_manage on public.maintenance_logs;
    create policy maintenance_logs_insert_manage
      on public.maintenance_logs
      for insert
      to authenticated
      with check (public.has_permission(auth.uid(), 'maintenance.manage'));

    drop policy if exists maintenance_logs_update_manage on public.maintenance_logs;
    create policy maintenance_logs_update_manage
      on public.maintenance_logs
      for update
      to authenticated
      using (public.has_permission(auth.uid(), 'maintenance.manage'))
      with check (public.has_permission(auth.uid(), 'maintenance.manage'));
  end if;
end
$$;

-- NOTE:
-- employees invite/resend are server-side routes and are intentionally untouched in this migration.
-- profiles update restrictions are intentionally not broadened here.

-- 0008_inventory.sql
-- Inventory (quantity-only) with locations and role-based RLS

create extension if not exists pgcrypto;

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null unique,
  location_type text,
  notes text
);

create table if not exists public.inventory_items (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  external_id text,
  name text not null,
  category text,
  quantity integer not null default 0,
  minimum_quantity integer not null default 0,
  location_id uuid null references public.inventory_locations(id) on delete set null,
  supplier text,
  supplier_link text,
  notes text,
  is_active boolean not null default true
);

create index if not exists inventory_locations_location_type_idx
  on public.inventory_locations (location_type);

create index if not exists inventory_items_name_idx
  on public.inventory_items (name);

create index if not exists inventory_items_category_idx
  on public.inventory_items (category);

create index if not exists inventory_items_location_id_idx
  on public.inventory_items (location_id);

create index if not exists inventory_items_is_active_idx
  on public.inventory_items (is_active);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_inventory_locations_updated_at on public.inventory_locations;
create trigger set_inventory_locations_updated_at
before update on public.inventory_locations
for each row
execute function public.set_updated_at();

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row
execute function public.set_updated_at();

alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;

drop policy if exists inventory_locations_select_authenticated on public.inventory_locations;
create policy inventory_locations_select_authenticated
  on public.inventory_locations
  for select
  to authenticated
  using (true);

drop policy if exists inventory_items_select_authenticated on public.inventory_items;
create policy inventory_items_select_authenticated
  on public.inventory_items
  for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE limited to owner, office_admin, mechanic roles.
-- Requires public.profiles with role text keyed by auth user id.
drop policy if exists inventory_locations_insert_role_based on public.inventory_locations;
create policy inventory_locations_insert_role_based
  on public.inventory_locations
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

drop policy if exists inventory_locations_update_role_based on public.inventory_locations;
create policy inventory_locations_update_role_based
  on public.inventory_locations
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

drop policy if exists inventory_locations_delete_role_based on public.inventory_locations;
create policy inventory_locations_delete_role_based
  on public.inventory_locations
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

drop policy if exists inventory_items_insert_role_based on public.inventory_items;
create policy inventory_items_insert_role_based
  on public.inventory_items
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

drop policy if exists inventory_items_update_role_based on public.inventory_items;
create policy inventory_items_update_role_based
  on public.inventory_items
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

drop policy if exists inventory_items_delete_role_based on public.inventory_items;
create policy inventory_items_delete_role_based
  on public.inventory_items
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

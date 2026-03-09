-- Multi-vendor support for purchase requests.

create table if not exists public.purchase_request_vendors (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  vendor_name text not null,
  sort_order integer not null default 1 check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_request_vendors_request_idx
  on public.purchase_request_vendors (purchase_request_id, sort_order, created_at);

drop trigger if exists trg_purchase_request_vendors_updated_at on public.purchase_request_vendors;
create trigger trg_purchase_request_vendors_updated_at
before update on public.purchase_request_vendors
for each row execute function public.set_updated_at();

alter table public.purchase_request_vendors enable row level security;

drop policy if exists purchase_request_vendors_select_manage on public.purchase_request_vendors;
create policy purchase_request_vendors_select_manage
  on public.purchase_request_vendors
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  );

drop policy if exists purchase_request_vendors_insert_manage on public.purchase_request_vendors;
create policy purchase_request_vendors_insert_manage
  on public.purchase_request_vendors
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  );

drop policy if exists purchase_request_vendors_update_manage on public.purchase_request_vendors;
create policy purchase_request_vendors_update_manage
  on public.purchase_request_vendors
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  );

drop policy if exists purchase_request_vendors_delete_manage on public.purchase_request_vendors;
create policy purchase_request_vendors_delete_manage
  on public.purchase_request_vendors
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  );

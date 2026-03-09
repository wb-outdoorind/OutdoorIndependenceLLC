-- Purchases workflow for maintenance-linked and independent requests.

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  request_date date not null default current_date,
  requested_by uuid null references auth.users(id) on delete set null,
  requested_for_id uuid null references auth.users(id) on delete set null,
  requested_for_name text null,
  department text not null check (
    department in ('Mowing', 'Administration', 'Landscaping', 'Fertilizing', 'Maintenance')
  ),
  vendor_name text not null,
  estimated_total numeric(12,2) not null default 0 check (estimated_total >= 0),
  timeline text not null check (
    timeline in (
      'Urgent (Immediately/Less than 24 hours)',
      'High Priority (1-3 days)',
      'Standard (Within a week)',
      'Low Priority (Needed within 2 weeks)',
      'Very Low Priority (Needed within 1 month)'
    )
  ),
  reason text not null,
  reimbursable boolean not null default false,
  purchase_method_requested text not null check (
    purchase_method_requested in ('Credit Card', 'Debit Card', 'Cash', 'Check', 'Company Charge Account', 'Other')
  ),
  purchase_method_other text null,
  maintenance_request_type text null check (maintenance_request_type in ('vehicle', 'equipment')),
  maintenance_request_id text null,
  maintenance_log_type text null check (maintenance_log_type in ('vehicle', 'equipment')),
  maintenance_log_id text null,
  asset_type text null check (asset_type in ('vehicle', 'equipment')),
  asset_id text null,
  manager_status text not null default 'pending' check (manager_status in ('pending', 'approved', 'partially_approved', 'denied')),
  manager_approved_at timestamptz null,
  manager_approved_by uuid null references auth.users(id) on delete set null,
  manager_signature text null,
  manager_note text null,
  ap_status text not null default 'pending' check (ap_status in ('pending', 'approved', 'partially_approved', 'denied')),
  ap_reviewed_at timestamptz null,
  ap_reviewed_by uuid null references auth.users(id) on delete set null,
  ap_signature text null,
  ap_note text null,
  funds_available_date date null,
  ap_payment_method text null check (
    ap_payment_method is null
    or ap_payment_method in ('Credit Card', 'Debit Card', 'Cash', 'Check', 'Company Charge Account', 'Other')
  ),
  ap_payment_method_other text null,
  ap_po_number text null,
  overall_status text not null default 'pending_manager_approval' check (
    overall_status in (
      'pending_manager_approval',
      'pending_ap_approval',
      'approved',
      'partially_approved',
      'denied',
      'completed'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  item_name text not null,
  item_description text null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  estimated_unit_cost numeric(12,2) null check (estimated_unit_cost is null or estimated_unit_cost >= 0),
  estimated_total numeric(12,2) null check (estimated_total is null or estimated_total >= 0),
  manager_decision text not null default 'pending' check (manager_decision in ('pending', 'approved', 'denied')),
  manager_note text null,
  ap_decision text not null default 'pending' check (ap_decision in ('pending', 'approved', 'denied')),
  ap_note text null,
  approved_payment_method text null check (
    approved_payment_method is null
    or approved_payment_method in ('Credit Card', 'Debit Card', 'Cash', 'Check', 'Company Charge Account', 'Other')
  ),
  approved_payment_method_other text null,
  approved_po_number text null,
  funds_available_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_request_attachments (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  item_id uuid null references public.purchase_request_items(id) on delete set null,
  attachment_type text not null check (attachment_type in ('quote', 'receipt')),
  file_name text not null,
  storage_bucket text not null default 'purchase_docs',
  storage_path text not null,
  uploaded_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists purchase_requests_created_idx
  on public.purchase_requests (created_at desc);
create index if not exists purchase_requests_status_idx
  on public.purchase_requests (overall_status, created_at desc);
create index if not exists purchase_requests_maintenance_request_idx
  on public.purchase_requests (maintenance_request_type, maintenance_request_id);
create index if not exists purchase_requests_maintenance_log_idx
  on public.purchase_requests (maintenance_log_type, maintenance_log_id);
create index if not exists purchase_requests_asset_idx
  on public.purchase_requests (asset_type, asset_id);

create index if not exists purchase_request_items_request_idx
  on public.purchase_request_items (purchase_request_id, created_at asc);
create index if not exists purchase_request_attachments_request_idx
  on public.purchase_request_attachments (purchase_request_id, created_at desc);

drop trigger if exists trg_purchase_requests_updated_at on public.purchase_requests;
create trigger trg_purchase_requests_updated_at
before update on public.purchase_requests
for each row execute function public.set_updated_at();

drop trigger if exists trg_purchase_request_items_updated_at on public.purchase_request_items;
create trigger trg_purchase_request_items_updated_at
before update on public.purchase_request_items
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'purchase_docs',
  'purchase_docs',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.purchase_request_attachments enable row level security;

drop policy if exists purchase_requests_select_manage on public.purchase_requests;
create policy purchase_requests_select_manage
  on public.purchase_requests
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

drop policy if exists purchase_requests_insert_manage on public.purchase_requests;
create policy purchase_requests_insert_manage
  on public.purchase_requests
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

drop policy if exists purchase_requests_update_manage on public.purchase_requests;
create policy purchase_requests_update_manage
  on public.purchase_requests
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

drop policy if exists purchase_requests_delete_manage on public.purchase_requests;
create policy purchase_requests_delete_manage
  on public.purchase_requests
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

drop policy if exists purchase_request_items_select_manage on public.purchase_request_items;
create policy purchase_request_items_select_manage
  on public.purchase_request_items
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

drop policy if exists purchase_request_items_insert_manage on public.purchase_request_items;
create policy purchase_request_items_insert_manage
  on public.purchase_request_items
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

drop policy if exists purchase_request_items_update_manage on public.purchase_request_items;
create policy purchase_request_items_update_manage
  on public.purchase_request_items
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

drop policy if exists purchase_request_items_delete_manage on public.purchase_request_items;
create policy purchase_request_items_delete_manage
  on public.purchase_request_items
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

drop policy if exists purchase_request_attachments_select_manage on public.purchase_request_attachments;
create policy purchase_request_attachments_select_manage
  on public.purchase_request_attachments
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

drop policy if exists purchase_request_attachments_insert_manage on public.purchase_request_attachments;
create policy purchase_request_attachments_insert_manage
  on public.purchase_request_attachments
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

drop policy if exists purchase_request_attachments_delete_manage on public.purchase_request_attachments;
create policy purchase_request_attachments_delete_manage
  on public.purchase_request_attachments
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

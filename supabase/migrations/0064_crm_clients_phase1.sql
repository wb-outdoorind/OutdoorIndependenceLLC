-- CRM Clients (Phase 1 persistence)
-- Introduces the shared CRM client backbone without changing Properties yet.

create table if not exists public.crm_clients (
  id text primary key,
  client_type text not null check (client_type in ('residential', 'commercial', 'hoa', 'municipal', 'other')),
  company_name text null,
  first_name text null,
  last_name text null,
  display_name text not null check (char_length(btrim(display_name)) > 0),
  primary_phone text null,
  secondary_phone text null,
  primary_email text null,
  billing_email text null,
  status text not null check (status in ('lead', 'active', 'inactive', 'archived')),
  preferred_contact_method text null check (
    preferred_contact_method is null
    or preferred_contact_method in ('phone', 'email', 'billing_email', 'text', 'other')
  ),
  notes text null,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_clients_display_name_idx
  on public.crm_clients (lower(display_name));

create index if not exists crm_clients_status_idx
  on public.crm_clients (status, created_at desc);

create index if not exists crm_clients_type_idx
  on public.crm_clients (client_type, created_at desc);

drop trigger if exists trg_crm_clients_updated_at on public.crm_clients;
create trigger trg_crm_clients_updated_at
before update on public.crm_clients
for each row execute function public.set_updated_at();

alter table public.crm_clients enable row level security;

drop policy if exists crm_clients_select_manage on public.crm_clients;
create policy crm_clients_select_manage
  on public.crm_clients
  for select
  to authenticated
  using (public.has_permission(auth.uid(), 'employees.manage'));

drop policy if exists crm_clients_insert_manage on public.crm_clients;
create policy crm_clients_insert_manage
  on public.crm_clients
  for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'employees.manage'));

drop policy if exists crm_clients_update_manage on public.crm_clients;
create policy crm_clients_update_manage
  on public.crm_clients
  for update
  to authenticated
  using (public.has_permission(auth.uid(), 'employees.manage'))
  with check (public.has_permission(auth.uid(), 'employees.manage'));

drop policy if exists crm_clients_delete_manage on public.crm_clients;
create policy crm_clients_delete_manage
  on public.crm_clients
  for delete
  to authenticated
  using (public.has_permission(auth.uid(), 'employees.manage'));

insert into public.crm_clients (
  id,
  client_type,
  company_name,
  first_name,
  last_name,
  display_name,
  primary_phone,
  secondary_phone,
  primary_email,
  billing_email,
  status,
  preferred_contact_method,
  notes,
  tags,
  created_at,
  updated_at
)
values
  (
    'client_maple_ridge_hoa',
    'hoa',
    'Maple Ridge HOA',
    null,
    null,
    'Maple Ridge HOA',
    '(262) 555-0142',
    '(262) 555-0143',
    'board@mapleridgehoa.com',
    'ap@mapleridgehoa.com',
    'active',
    'email',
    'Seasonal turf work, landscape maintenance, and snow pushes route through the HOA board.',
    array['hoa', 'snow', 'fertilizing'],
    '2026-03-27T09:00:00.000Z'::timestamptz,
    '2026-03-27T09:00:00.000Z'::timestamptz
  ),
  (
    'client_keller_residence',
    'residential',
    null,
    'Sarah',
    'Keller',
    'Sarah Keller',
    '(414) 555-0198',
    null,
    'sarah.keller@email.com',
    'sarah.keller@email.com',
    'active',
    'text',
    'Primary residential account with fertilizing and recurring maintenance interest.',
    array['residential', 'maintenance'],
    '2026-03-27T09:00:00.000Z'::timestamptz,
    '2026-03-27T09:00:00.000Z'::timestamptz
  ),
  (
    'client_brookfield_parks',
    'municipal',
    'City of Brookfield Parks',
    'Dana',
    'Lopez',
    'City of Brookfield Parks',
    '(262) 555-0111',
    '(262) 555-0112',
    'd.lopez@brookfield.gov',
    'invoices@brookfield.gov',
    'active',
    'billing_email',
    'Municipal grounds account with multiple service locations and snow escalation expectations.',
    array['municipal', 'multi-site'],
    '2026-03-27T09:00:00.000Z'::timestamptz,
    '2026-03-27T09:00:00.000Z'::timestamptz
  ),
  (
    'client_northside_commerce',
    'commercial',
    'Northside Commerce Center',
    'Eric',
    'Pruitt',
    'Northside Commerce Center',
    '(414) 555-0220',
    null,
    'epruitt@northsidecommerce.com',
    'ap@northsidecommerce.com',
    'inactive',
    'phone',
    'Former fertilizing-heavy site now paused pending budget review.',
    array['commercial', 'inactive'],
    '2026-03-27T09:00:00.000Z'::timestamptz,
    '2026-03-27T09:00:00.000Z'::timestamptz
  )
on conflict (id) do update
set
  client_type = excluded.client_type,
  company_name = excluded.company_name,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  display_name = excluded.display_name,
  primary_phone = excluded.primary_phone,
  secondary_phone = excluded.secondary_phone,
  primary_email = excluded.primary_email,
  billing_email = excluded.billing_email,
  status = excluded.status,
  preferred_contact_method = excluded.preferred_contact_method,
  notes = excluded.notes,
  tags = excluded.tags,
  updated_at = excluded.updated_at;

-- CRM Properties (Phase 2 persistence)
-- Adds the shared property model and links it to crm_clients.

create table if not exists public.crm_properties (
  id text primary key,
  client_id text not null references public.crm_clients(id) on delete cascade,
  property_name text not null check (char_length(btrim(property_name)) > 0),
  address_line_1 text not null default '',
  address_line_2 text null,
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  country text not null default 'US' check (char_length(btrim(country)) > 0),
  property_type text not null check (property_type in ('residential', 'commercial', 'multi_site', 'other')),
  lawn_size_sqft numeric(12,2) null check (lawn_size_sqft is null or lawn_size_sqft >= 0),
  acreage numeric(12,4) null check (acreage is null or acreage >= 0),
  gate_present boolean not null default false,
  locked_gate boolean not null default false,
  pets_present boolean not null default false,
  entry_notes text null,
  site_notes text null,
  billing_same_as_service_address boolean not null default true,
  billing_address_line_1 text null,
  billing_address_line_2 text null,
  billing_city text null,
  billing_state text null,
  billing_postal_code text null,
  billing_country text null,
  is_active boolean not null default true,
  route_group text null,
  snow_priority text null,
  fertilizing_preferences text null,
  maintenance_contract_link text null,
  latitude double precision null,
  longitude double precision null,
  service_templates text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_properties_client_id_idx
  on public.crm_properties (client_id, created_at desc);

create index if not exists crm_properties_client_property_name_idx
  on public.crm_properties (client_id, lower(property_name));

create index if not exists crm_properties_status_type_idx
  on public.crm_properties (is_active, property_type, created_at desc);

create index if not exists crm_properties_route_group_idx
  on public.crm_properties (route_group)
  where route_group is not null;

drop trigger if exists trg_crm_properties_updated_at on public.crm_properties;
create trigger trg_crm_properties_updated_at
before update on public.crm_properties
for each row execute function public.set_updated_at();

alter table public.crm_properties enable row level security;

drop policy if exists crm_properties_select_manage on public.crm_properties;
create policy crm_properties_select_manage
  on public.crm_properties
  for select
  to authenticated
  using (public.has_permission(auth.uid(), 'employees.manage'));

drop policy if exists crm_properties_insert_manage on public.crm_properties;
create policy crm_properties_insert_manage
  on public.crm_properties
  for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'employees.manage'));

drop policy if exists crm_properties_update_manage on public.crm_properties;
create policy crm_properties_update_manage
  on public.crm_properties
  for update
  to authenticated
  using (public.has_permission(auth.uid(), 'employees.manage'))
  with check (public.has_permission(auth.uid(), 'employees.manage'));

drop policy if exists crm_properties_delete_manage on public.crm_properties;
create policy crm_properties_delete_manage
  on public.crm_properties
  for delete
  to authenticated
  using (public.has_permission(auth.uid(), 'employees.manage'));

insert into public.crm_properties (
  id,
  client_id,
  property_name,
  address_line_1,
  address_line_2,
  city,
  state,
  postal_code,
  country,
  property_type,
  lawn_size_sqft,
  acreage,
  gate_present,
  locked_gate,
  pets_present,
  entry_notes,
  site_notes,
  billing_same_as_service_address,
  billing_address_line_1,
  billing_address_line_2,
  billing_city,
  billing_state,
  billing_postal_code,
  billing_country,
  is_active,
  route_group,
  snow_priority,
  fertilizing_preferences,
  maintenance_contract_link,
  latitude,
  longitude,
  service_templates,
  created_at,
  updated_at
)
values
  (
    'property_maple_ridge_clubhouse',
    'client_maple_ridge_hoa',
    'Clubhouse & Entry Beds',
    '1880 Maple Ridge Dr',
    null,
    'New Berlin',
    'WI',
    '53151',
    'US',
    'commercial',
    62000,
    1.42,
    false,
    false,
    false,
    'Crew can stage near the west clubhouse lot before 8 AM.',
    'High-visibility entry beds, clubhouse lawn, and sidewalk edges.',
    false,
    'PO Box 411',
    null,
    'New Berlin',
    'WI',
    '53151',
    'US',
    true,
    'West HOA',
    'priority_1',
    'Slow-release preferred around clubhouse beds.',
    'Annual grounds package',
    null,
    null,
    array['grounds-maintenance', 'snow-push'],
    '2026-03-27T09:00:00.000Z'::timestamptz,
    '2026-03-27T09:00:00.000Z'::timestamptz
  ),
  (
    'property_maple_ridge_north',
    'client_maple_ridge_hoa',
    'North Entrance',
    '4205 S Moorland Rd',
    null,
    'New Berlin',
    'WI',
    '53151',
    'US',
    'other',
    14000,
    0.32,
    false,
    false,
    false,
    null,
    'Smaller entry monument area with irrigation heads close to curb.',
    true,
    null,
    null,
    null,
    null,
    null,
    null,
    true,
    'West HOA',
    'priority_2',
    null,
    'Annual grounds package',
    null,
    null,
    array['entry-detail'],
    '2026-03-27T09:00:00.000Z'::timestamptz,
    '2026-03-27T09:00:00.000Z'::timestamptz
  ),
  (
    'property_keller_home',
    'client_keller_residence',
    'Keller Residence',
    '9123 Glenwood Ct',
    null,
    'Muskego',
    'WI',
    '53150',
    'US',
    'residential',
    18500,
    0.42,
    true,
    true,
    true,
    'Text before arrival. Back gate latch sticks when wet.',
    'Family prefers edging every other visit and low-noise equipment before 9 AM.',
    true,
    null,
    null,
    null,
    null,
    null,
    null,
    true,
    'Muskego South',
    'priority_2',
    'Avoid application near raised herb beds.',
    'Recurring maintenance proposal',
    null,
    null,
    array['residential-maintenance', 'fert-program'],
    '2026-03-27T09:00:00.000Z'::timestamptz,
    '2026-03-27T09:00:00.000Z'::timestamptz
  ),
  (
    'property_brookfield_admin',
    'client_brookfield_parks',
    'Parks Admin Campus',
    '2000 Greenway Ave',
    null,
    'Brookfield',
    'WI',
    '53045',
    'US',
    'multi_site',
    98000,
    2.25,
    true,
    false,
    false,
    'Coordinate with parks staff if trucks need the rear yard entrance.',
    'Admin campus, trail edge mowing, and seasonal annual beds.',
    false,
    '100 City Hall Plaza',
    'Accounts Payable',
    'Brookfield',
    'WI',
    '53045',
    'US',
    true,
    'Municipal Core',
    'priority_1',
    null,
    'Municipal grounds agreement',
    null,
    null,
    array['municipal-maintenance', 'snow-route'],
    '2026-03-27T09:00:00.000Z'::timestamptz,
    '2026-03-27T09:00:00.000Z'::timestamptz
  ),
  (
    'property_northside_lot_a',
    'client_northside_commerce',
    'Lot A & Frontage',
    '7400 Commerce Pkwy',
    'Building A',
    'Milwaukee',
    'WI',
    '53224',
    'US',
    'commercial',
    44000,
    1.01,
    true,
    true,
    false,
    'Property manager must be called before any after-hours access.',
    'Inactive account but keep frontage notes for possible reactivation.',
    true,
    null,
    null,
    null,
    null,
    null,
    null,
    false,
    'Commerce North',
    'priority_3',
    null,
    null,
    null,
    null,
    array['commercial-maintenance'],
    '2026-03-27T09:00:00.000Z'::timestamptz,
    '2026-03-27T09:00:00.000Z'::timestamptz
  )
on conflict (id) do update
set
  client_id = excluded.client_id,
  property_name = excluded.property_name,
  address_line_1 = excluded.address_line_1,
  address_line_2 = excluded.address_line_2,
  city = excluded.city,
  state = excluded.state,
  postal_code = excluded.postal_code,
  country = excluded.country,
  property_type = excluded.property_type,
  lawn_size_sqft = excluded.lawn_size_sqft,
  acreage = excluded.acreage,
  gate_present = excluded.gate_present,
  locked_gate = excluded.locked_gate,
  pets_present = excluded.pets_present,
  entry_notes = excluded.entry_notes,
  site_notes = excluded.site_notes,
  billing_same_as_service_address = excluded.billing_same_as_service_address,
  billing_address_line_1 = excluded.billing_address_line_1,
  billing_address_line_2 = excluded.billing_address_line_2,
  billing_city = excluded.billing_city,
  billing_state = excluded.billing_state,
  billing_postal_code = excluded.billing_postal_code,
  billing_country = excluded.billing_country,
  is_active = excluded.is_active,
  route_group = excluded.route_group,
  snow_priority = excluded.snow_priority,
  fertilizing_preferences = excluded.fertilizing_preferences,
  maintenance_contract_link = excluded.maintenance_contract_link,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  service_templates = excluded.service_templates,
  updated_at = excluded.updated_at;

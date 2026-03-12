-- Fertilizing Operations (Phase 1 foundation)
-- Clients, properties, and phase-2-ready product/service tables.

create table if not exists public.fert_clients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(btrim(first_name)) > 0),
  middle_name text null,
  last_name text not null check (char_length(btrim(last_name)) > 0),
  phone text null,
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fert_properties (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.fert_clients(id) on delete cascade,
  property_name text not null check (char_length(btrim(property_name)) > 0),
  address_line_1 text not null check (char_length(btrim(address_line_1)) > 0),
  address_line_2 text null,
  city text not null default '' check (char_length(btrim(city)) > 0),
  state text not null default '' check (char_length(btrim(state)) > 0),
  postal_code text not null default '' check (char_length(btrim(postal_code)) > 0),
  lawn_sqft numeric(12,2) not null default 0 check (lawn_sqft >= 0),
  lawn_acres numeric(12,6) not null default 0 check (lawn_acres >= 0),
  property_type text not null check (property_type in ('Residential', 'Commercial')),
  gate_present boolean not null default false,
  locked_gate boolean not null default false,
  pets_present boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lawn_sqft > 0 or lawn_acres > 0)
);

create unique index if not exists fert_properties_client_property_name_unq
  on public.fert_properties (client_id, lower(property_name));

create index if not exists fert_properties_client_id_idx
  on public.fert_properties (client_id, created_at desc);
create index if not exists fert_properties_property_type_idx
  on public.fert_properties (property_type, created_at desc);

create table if not exists public.fert_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_unit text not null,
  default_target_pest text null,
  default_application_rate text null,
  epa_registration_number text null,
  default_reentry_interval_ppe_notes text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fert_products_name_unq
  on public.fert_products (lower(name));

create table if not exists public.fert_service_records (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.fert_properties(id) on delete cascade,
  applicator_id uuid null references auth.users(id) on delete set null,
  applicator_name text null,
  applicator_license_number text null,
  service_date date null,
  start_time time null,
  end_time time null,
  typed_legal_signature text null,
  signature_drawn_data text null,
  signature_mode text null check (signature_mode is null or signature_mode in ('typed', 'drawn')),
  check (
    signature_mode is null
    or (signature_mode = 'typed' and char_length(coalesce(btrim(typed_legal_signature), '')) > 0)
    or (signature_mode = 'drawn' and char_length(coalesce(signature_drawn_data, '')) > 0)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fert_service_records_property_id_idx
  on public.fert_service_records (property_id, created_at desc);
create index if not exists fert_service_records_applicator_id_idx
  on public.fert_service_records (applicator_id, created_at desc);

create table if not exists public.fert_service_chemicals (
  id uuid primary key default gen_random_uuid(),
  service_record_id uuid not null references public.fert_service_records(id) on delete cascade,
  product_id uuid null references public.fert_products(id) on delete set null,
  chemical_name text not null,
  epa_registration_number text null,
  batch_lot_number text null,
  concentration text null,
  target_pest text null,
  total_applied numeric(12,4) null check (total_applied is null or total_applied >= 0),
  units text null,
  application_area_sqft numeric(12,2) null check (application_area_sqft is null or application_area_sqft >= 0),
  application_rate text null,
  reentry_interval_ppe_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fert_service_chemicals_service_record_idx
  on public.fert_service_chemicals (service_record_id, created_at asc);

drop trigger if exists trg_fert_clients_updated_at on public.fert_clients;
create trigger trg_fert_clients_updated_at
before update on public.fert_clients
for each row execute function public.set_updated_at();

drop trigger if exists trg_fert_properties_updated_at on public.fert_properties;
create trigger trg_fert_properties_updated_at
before update on public.fert_properties
for each row execute function public.set_updated_at();

drop trigger if exists trg_fert_products_updated_at on public.fert_products;
create trigger trg_fert_products_updated_at
before update on public.fert_products
for each row execute function public.set_updated_at();

drop trigger if exists trg_fert_service_records_updated_at on public.fert_service_records;
create trigger trg_fert_service_records_updated_at
before update on public.fert_service_records
for each row execute function public.set_updated_at();

drop trigger if exists trg_fert_service_chemicals_updated_at on public.fert_service_chemicals;
create trigger trg_fert_service_chemicals_updated_at
before update on public.fert_service_chemicals
for each row execute function public.set_updated_at();

alter table public.fert_clients enable row level security;
alter table public.fert_properties enable row level security;
alter table public.fert_products enable row level security;
alter table public.fert_service_records enable row level security;
alter table public.fert_service_chemicals enable row level security;

drop policy if exists fert_clients_select_authenticated on public.fert_clients;
create policy fert_clients_select_authenticated
  on public.fert_clients
  for select
  to authenticated
  using (true);

drop policy if exists fert_clients_manage on public.fert_clients;
create policy fert_clients_manage
  on public.fert_clients
  for all
  to authenticated
  using (public.has_permission(auth.uid(), 'maintenance.manage'))
  with check (public.has_permission(auth.uid(), 'maintenance.manage'));

drop policy if exists fert_properties_select_authenticated on public.fert_properties;
create policy fert_properties_select_authenticated
  on public.fert_properties
  for select
  to authenticated
  using (true);

drop policy if exists fert_properties_manage on public.fert_properties;
create policy fert_properties_manage
  on public.fert_properties
  for all
  to authenticated
  using (public.has_permission(auth.uid(), 'maintenance.manage'))
  with check (public.has_permission(auth.uid(), 'maintenance.manage'));

drop policy if exists fert_products_select_authenticated on public.fert_products;
create policy fert_products_select_authenticated
  on public.fert_products
  for select
  to authenticated
  using (true);

drop policy if exists fert_products_manage on public.fert_products;
create policy fert_products_manage
  on public.fert_products
  for all
  to authenticated
  using (public.has_permission(auth.uid(), 'maintenance.manage'))
  with check (public.has_permission(auth.uid(), 'maintenance.manage'));

drop policy if exists fert_service_records_select_authenticated on public.fert_service_records;
create policy fert_service_records_select_authenticated
  on public.fert_service_records
  for select
  to authenticated
  using (true);

drop policy if exists fert_service_records_insert_authenticated on public.fert_service_records;
create policy fert_service_records_insert_authenticated
  on public.fert_service_records
  for insert
  to authenticated
  with check (
    public.has_permission(auth.uid(), 'maintenance.manage')
    or applicator_id is null
    or applicator_id = auth.uid()
  );

drop policy if exists fert_service_records_update_authenticated on public.fert_service_records;
create policy fert_service_records_update_authenticated
  on public.fert_service_records
  for update
  to authenticated
  using (
    public.has_permission(auth.uid(), 'maintenance.manage')
    or applicator_id is null
    or applicator_id = auth.uid()
  )
  with check (
    public.has_permission(auth.uid(), 'maintenance.manage')
    or applicator_id is null
    or applicator_id = auth.uid()
  );

drop policy if exists fert_service_records_delete_authenticated on public.fert_service_records;
create policy fert_service_records_delete_authenticated
  on public.fert_service_records
  for delete
  to authenticated
  using (
    public.has_permission(auth.uid(), 'maintenance.manage')
    or applicator_id = auth.uid()
  );

drop policy if exists fert_service_chemicals_select_authenticated on public.fert_service_chemicals;
create policy fert_service_chemicals_select_authenticated
  on public.fert_service_chemicals
  for select
  to authenticated
  using (true);

drop policy if exists fert_service_chemicals_insert_authenticated on public.fert_service_chemicals;
create policy fert_service_chemicals_insert_authenticated
  on public.fert_service_chemicals
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.fert_service_records fsr
      where fsr.id = fert_service_chemicals.service_record_id
        and (
          public.has_permission(auth.uid(), 'maintenance.manage')
          or fsr.applicator_id is null
          or fsr.applicator_id = auth.uid()
        )
    )
  );

drop policy if exists fert_service_chemicals_update_authenticated on public.fert_service_chemicals;
create policy fert_service_chemicals_update_authenticated
  on public.fert_service_chemicals
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.fert_service_records fsr
      where fsr.id = fert_service_chemicals.service_record_id
        and (
          public.has_permission(auth.uid(), 'maintenance.manage')
          or fsr.applicator_id is null
          or fsr.applicator_id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.fert_service_records fsr
      where fsr.id = fert_service_chemicals.service_record_id
        and (
          public.has_permission(auth.uid(), 'maintenance.manage')
          or fsr.applicator_id is null
          or fsr.applicator_id = auth.uid()
        )
    )
  );

drop policy if exists fert_service_chemicals_delete_authenticated on public.fert_service_chemicals;
create policy fert_service_chemicals_delete_authenticated
  on public.fert_service_chemicals
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.fert_service_records fsr
      where fsr.id = fert_service_chemicals.service_record_id
        and (
          public.has_permission(auth.uid(), 'maintenance.manage')
          or fsr.applicator_id = auth.uid()
        )
    )
  );

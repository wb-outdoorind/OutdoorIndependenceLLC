-- Fertilizing phase 2.2: track equipment used per service record.

alter table if exists public.fert_service_records
  add column if not exists equipment_used jsonb not null default '[]'::jsonb;

update public.fert_service_records
set equipment_used = '[]'::jsonb
where equipment_used is null;

alter table public.fert_service_records
  drop constraint if exists fert_service_records_equipment_used_is_array;

alter table public.fert_service_records
  add constraint fert_service_records_equipment_used_is_array
  check (jsonb_typeof(equipment_used) = 'array');

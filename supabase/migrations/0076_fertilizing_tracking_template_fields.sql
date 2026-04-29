-- Fertilizing chemical tracking template alignment fields

alter table if exists public.fert_service_records
  add column if not exists calibration_verified boolean null,
  add column if not exists precipitation text null,
  add column if not exists additional_notes text null;

alter table public.fert_service_records
  drop constraint if exists fert_service_records_precipitation_check;

alter table public.fert_service_records
  add constraint fert_service_records_precipitation_check
  check (
    precipitation is null
    or precipitation in ('N/A', 'Light', 'Moderate', 'Heavy')
  );

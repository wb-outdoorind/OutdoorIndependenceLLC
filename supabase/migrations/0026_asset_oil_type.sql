alter table if exists public.vehicles
  add column if not exists oil_type text null;

alter table if exists public.equipment
  add column if not exists oil_type text null;

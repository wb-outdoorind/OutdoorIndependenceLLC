-- Fertilizing phase 2.1 weather capture fields

alter table if exists public.fert_service_records
  add column if not exists weather_temperature_f numeric(6,2) null,
  add column if not exists weather_wind_speed_mph numeric(6,2) null,
  add column if not exists weather_wind_direction text null,
  add column if not exists weather_conditions text null,
  add column if not exists weather_observed_at timestamptz null,
  add column if not exists weather_source text null;

-- 0002_vehicles_select_authenticated.sql

alter table if exists public.vehicles enable row level security;

drop policy if exists vehicles_select_authenticated on public.vehicles;
create policy vehicles_select_authenticated
  on public.vehicles
  for select
  to authenticated
  using (true);

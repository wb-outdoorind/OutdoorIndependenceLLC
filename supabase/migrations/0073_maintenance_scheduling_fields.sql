-- Add day-based scheduling fields for maintenance request planning surfaces.

alter table if exists public.maintenance_requests
  add column if not exists scheduled_date date null,
  add column if not exists scheduled_time time null,
  add column if not exists assigned_to uuid null references public.profiles(id) on delete set null,
  add column if not exists position integer not null default 0;

alter table if exists public.equipment_maintenance_requests
  add column if not exists scheduled_date date null,
  add column if not exists scheduled_time time null,
  add column if not exists assigned_to uuid null references public.profiles(id) on delete set null,
  add column if not exists position integer not null default 0;

create index if not exists maintenance_requests_scheduled_date_idx
  on public.maintenance_requests(scheduled_date);
create index if not exists maintenance_requests_assigned_to_idx
  on public.maintenance_requests(assigned_to);
create index if not exists maintenance_requests_schedule_position_idx
  on public.maintenance_requests(scheduled_date, position);

create index if not exists equipment_maintenance_requests_scheduled_date_idx
  on public.equipment_maintenance_requests(scheduled_date);
create index if not exists equipment_maintenance_requests_assigned_to_idx
  on public.equipment_maintenance_requests(assigned_to);
create index if not exists equipment_maintenance_requests_schedule_position_idx
  on public.equipment_maintenance_requests(scheduled_date, position);

-- 0054_forms_history_scope_and_role_cleanup.sql
-- Add direct-report scoping support for forms history and retire legacy teammate role usage.

alter table if exists public.profiles
  add column if not exists manager_id uuid null references public.profiles(id) on delete set null;

create index if not exists profiles_manager_id_idx
  on public.profiles(manager_id);

alter table if exists public.inspections
  add column if not exists submitted_by_user_id uuid null references public.profiles(id) on delete set null;

alter table if exists public.maintenance_requests
  add column if not exists submitted_by_user_id uuid null references public.profiles(id) on delete set null;

alter table if exists public.maintenance_logs
  add column if not exists submitted_by_user_id uuid null references public.profiles(id) on delete set null;

alter table if exists public.vehicle_pm_events
  add column if not exists submitted_by_user_id uuid null references public.profiles(id) on delete set null;

alter table if exists public.equipment_maintenance_requests
  add column if not exists submitted_by_user_id uuid null references public.profiles(id) on delete set null;

alter table if exists public.equipment_maintenance_logs
  add column if not exists submitted_by_user_id uuid null references public.profiles(id) on delete set null;

alter table if exists public.equipment_pm_events
  add column if not exists submitted_by_user_id uuid null references public.profiles(id) on delete set null;

create index if not exists inspections_submitted_by_user_id_created_idx
  on public.inspections(submitted_by_user_id, created_at desc);

create index if not exists maintenance_requests_submitted_by_user_id_created_idx
  on public.maintenance_requests(submitted_by_user_id, created_at desc);

create index if not exists maintenance_logs_submitted_by_user_id_created_idx
  on public.maintenance_logs(submitted_by_user_id, created_at desc);

create index if not exists vehicle_pm_events_submitted_by_user_id_created_idx
  on public.vehicle_pm_events(submitted_by_user_id, created_at desc);

create index if not exists equipment_maintenance_requests_submitted_by_user_id_created_idx
  on public.equipment_maintenance_requests(submitted_by_user_id, created_at desc);

create index if not exists equipment_maintenance_logs_submitted_by_user_id_created_idx
  on public.equipment_maintenance_logs(submitted_by_user_id, created_at desc);

create index if not exists equipment_pm_events_submitted_by_user_id_created_idx
  on public.equipment_pm_events(submitted_by_user_id, created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maintenance_logs'
      and column_name = 'created_by'
  ) then
    execute $sql$
      update public.maintenance_logs
      set submitted_by_user_id = created_by
      where submitted_by_user_id is null
        and created_by is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'equipment_maintenance_logs'
      and column_name = 'created_by'
  ) then
    execute $sql$
      update public.equipment_maintenance_logs
      set submitted_by_user_id = created_by
      where submitted_by_user_id is null
        and created_by is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicle_pm_events'
      and column_name = 'created_by'
  ) then
    execute $sql$
      update public.vehicle_pm_events
      set submitted_by_user_id = created_by
      where submitted_by_user_id is null
        and created_by is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'equipment_pm_events'
      and column_name = 'created_by'
  ) then
    execute $sql$
      update public.equipment_pm_events
      set submitted_by_user_id = created_by
      where submitted_by_user_id is null
        and created_by is not null
    $sql$;
  end if;
end
$$;

update public.profiles
set role = 'team_member_1'
where role = 'teammate';

update public.profiles
set role = 'employee'
where role is not null
  and role not in (
    'owner',
    'operations_manager',
    'office_admin',
    'mechanic',
    'apprentice',
    'team_lead_1',
    'team_lead_2',
    'team_member_1',
    'team_member_2',
    'employee'
  );

alter table if exists public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (
    role is null
    or role in (
      'owner',
      'operations_manager',
      'office_admin',
      'mechanic',
      'apprentice',
      'team_lead_1',
      'team_lead_2',
      'team_member_1',
      'team_member_2',
      'employee'
    )
  );

do $$
declare
  target_ids uuid[];
begin
  select array_agg(p.id)
  into target_ids
  from public.profiles p
  where lower(coalesce(p.full_name, '')) = 'employee test test'
    and lower(coalesce(p.email, '')) = 'william.p.bingen@gmail.com';

  if target_ids is null or cardinality(target_ids) = 0 then
    return;
  end if;

  begin
    delete from auth.users where id = any(target_ids);
  exception
    when others then
      null;
  end;

  delete from public.profiles where id = any(target_ids);
end
$$;

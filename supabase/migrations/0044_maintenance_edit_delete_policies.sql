-- Allow maintenance.manage users to update/delete maintenance request/log records
-- across vehicle and equipment maintenance tables.

do $$
begin
  if to_regclass('public.maintenance_requests') is not null then
    alter table public.maintenance_requests enable row level security;

    drop policy if exists maintenance_requests_delete_manage on public.maintenance_requests;
    create policy maintenance_requests_delete_manage
      on public.maintenance_requests
      for delete
      to authenticated
      using (public.has_permission(auth.uid(), 'maintenance.manage'));
  end if;

  if to_regclass('public.maintenance_logs') is not null then
    alter table public.maintenance_logs enable row level security;

    drop policy if exists maintenance_logs_delete_manage on public.maintenance_logs;
    create policy maintenance_logs_delete_manage
      on public.maintenance_logs
      for delete
      to authenticated
      using (public.has_permission(auth.uid(), 'maintenance.manage'));
  end if;

  if to_regclass('public.equipment_maintenance_requests') is not null then
    alter table public.equipment_maintenance_requests enable row level security;

    drop policy if exists equipment_maintenance_requests_update_manage on public.equipment_maintenance_requests;
    create policy equipment_maintenance_requests_update_manage
      on public.equipment_maintenance_requests
      for update
      to authenticated
      using (public.has_permission(auth.uid(), 'maintenance.manage'))
      with check (public.has_permission(auth.uid(), 'maintenance.manage'));

    drop policy if exists equipment_maintenance_requests_delete_manage on public.equipment_maintenance_requests;
    create policy equipment_maintenance_requests_delete_manage
      on public.equipment_maintenance_requests
      for delete
      to authenticated
      using (public.has_permission(auth.uid(), 'maintenance.manage'));
  end if;

  if to_regclass('public.equipment_maintenance_logs') is not null then
    alter table public.equipment_maintenance_logs enable row level security;

    drop policy if exists equipment_maintenance_logs_update_manage on public.equipment_maintenance_logs;
    create policy equipment_maintenance_logs_update_manage
      on public.equipment_maintenance_logs
      for update
      to authenticated
      using (public.has_permission(auth.uid(), 'maintenance.manage'))
      with check (public.has_permission(auth.uid(), 'maintenance.manage'));

    drop policy if exists equipment_maintenance_logs_delete_manage on public.equipment_maintenance_logs;
    create policy equipment_maintenance_logs_delete_manage
      on public.equipment_maintenance_logs
      for delete
      to authenticated
      using (public.has_permission(auth.uid(), 'maintenance.manage'));
  end if;
end
$$;

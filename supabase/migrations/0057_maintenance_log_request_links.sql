-- Allow maintenance logs to link to one or more maintenance requests.
-- Keep existing request_id column behavior as the primary linked request.

do $$
declare
  maintenance_log_id_type text;
  maintenance_request_id_type text;
  equipment_log_id_type text;
  equipment_request_id_type text;
begin
  if to_regclass('public.maintenance_logs') is not null
     and to_regclass('public.maintenance_requests') is not null then
    select format_type(a.atttypid, a.atttypmod)
      into maintenance_log_id_type
    from pg_attribute a
    where a.attrelid = 'public.maintenance_logs'::regclass
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;

    select format_type(a.atttypid, a.atttypmod)
      into maintenance_request_id_type
    from pg_attribute a
    where a.attrelid = 'public.maintenance_requests'::regclass
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;

    maintenance_log_id_type := coalesce(maintenance_log_id_type, 'text');
    maintenance_request_id_type := coalesce(maintenance_request_id_type, 'text');

    execute format(
      'create table if not exists public.maintenance_log_request_links (
        maintenance_log_id %s not null references public.maintenance_logs(id) on delete cascade,
        request_id %s not null references public.maintenance_requests(id) on delete cascade,
        created_at timestamptz not null default now(),
        created_by uuid null,
        primary key (maintenance_log_id, request_id)
      )',
      maintenance_log_id_type,
      maintenance_request_id_type
    );

    create index if not exists maintenance_log_request_links_request_id_idx
      on public.maintenance_log_request_links(request_id);
    create index if not exists maintenance_log_request_links_log_id_idx
      on public.maintenance_log_request_links(maintenance_log_id);

    alter table public.maintenance_log_request_links enable row level security;

    drop policy if exists maintenance_log_request_links_select_authenticated on public.maintenance_log_request_links;
    create policy maintenance_log_request_links_select_authenticated
      on public.maintenance_log_request_links
      for select
      to authenticated
      using (true);

    drop policy if exists maintenance_log_request_links_insert_manage on public.maintenance_log_request_links;
    create policy maintenance_log_request_links_insert_manage
      on public.maintenance_log_request_links
      for insert
      to authenticated
      with check (public.has_permission(auth.uid(), 'maintenance.manage'));

    drop policy if exists maintenance_log_request_links_delete_manage on public.maintenance_log_request_links;
    create policy maintenance_log_request_links_delete_manage
      on public.maintenance_log_request_links
      for delete
      to authenticated
      using (public.has_permission(auth.uid(), 'maintenance.manage'));
  end if;

  if to_regclass('public.equipment_maintenance_logs') is not null
     and to_regclass('public.equipment_maintenance_requests') is not null then
    select format_type(a.atttypid, a.atttypmod)
      into equipment_log_id_type
    from pg_attribute a
    where a.attrelid = 'public.equipment_maintenance_logs'::regclass
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;

    select format_type(a.atttypid, a.atttypmod)
      into equipment_request_id_type
    from pg_attribute a
    where a.attrelid = 'public.equipment_maintenance_requests'::regclass
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;

    equipment_log_id_type := coalesce(equipment_log_id_type, 'text');
    equipment_request_id_type := coalesce(equipment_request_id_type, 'text');

    execute format(
      'create table if not exists public.equipment_maintenance_log_request_links (
        maintenance_log_id %s not null references public.equipment_maintenance_logs(id) on delete cascade,
        request_id %s not null references public.equipment_maintenance_requests(id) on delete cascade,
        created_at timestamptz not null default now(),
        created_by uuid null,
        primary key (maintenance_log_id, request_id)
      )',
      equipment_log_id_type,
      equipment_request_id_type
    );

    create index if not exists equipment_maintenance_log_request_links_request_id_idx
      on public.equipment_maintenance_log_request_links(request_id);
    create index if not exists equipment_maintenance_log_request_links_log_id_idx
      on public.equipment_maintenance_log_request_links(maintenance_log_id);

    alter table public.equipment_maintenance_log_request_links enable row level security;

    drop policy if exists equipment_maintenance_log_request_links_select_authenticated on public.equipment_maintenance_log_request_links;
    create policy equipment_maintenance_log_request_links_select_authenticated
      on public.equipment_maintenance_log_request_links
      for select
      to authenticated
      using (true);

    drop policy if exists equipment_maintenance_log_request_links_insert_manage on public.equipment_maintenance_log_request_links;
    create policy equipment_maintenance_log_request_links_insert_manage
      on public.equipment_maintenance_log_request_links
      for insert
      to authenticated
      with check (public.has_permission(auth.uid(), 'maintenance.manage'));

    drop policy if exists equipment_maintenance_log_request_links_delete_manage on public.equipment_maintenance_log_request_links;
    create policy equipment_maintenance_log_request_links_delete_manage
      on public.equipment_maintenance_log_request_links
      for delete
      to authenticated
      using (public.has_permission(auth.uid(), 'maintenance.manage'));
  end if;
end
$$;

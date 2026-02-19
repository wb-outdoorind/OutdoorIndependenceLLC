-- Expand role model:
-- - operations_manager is owner-equivalent
-- - team_member_1/team_member_2 are teammate-equivalent

create or replace function public.has_permission(p_user_id uuid, p_perm text)
returns boolean
language plpgsql
stable
as $$
declare
  v_role text;
  v_allow jsonb := '{}'::jsonb;
  v_deny jsonb := '{}'::jsonb;
  v_preset boolean := false;
begin
  if p_user_id is null or p_perm is null or btrim(p_perm) = '' then
    return false;
  end if;

  select role
  into v_role
  from public.profiles
  where id = p_user_id;

  v_role := coalesce(v_role, 'employee');

  if v_role in ('employee', 'team_member_1', 'team_member_2') then
    v_preset := p_perm in ('vehicles.view', 'equipment.view', 'maintenance.view');

  elsif v_role = 'mechanic' then
    v_preset := p_perm in (
      'vehicles.view',
      'equipment.view',
      'maintenance.view',
      'inventory.view',
      'ops.view',
      'maintenance.manage',
      'inventory.manage'
    );

  elsif v_role in ('office_admin', 'owner', 'operations_manager') then
    v_preset := p_perm in (
      'vehicles.view',
      'equipment.view',
      'maintenance.view',
      'inventory.view',
      'employees.view',
      'ops.view',
      'vehicles.manage',
      'equipment.manage',
      'maintenance.manage',
      'inventory.manage',
      'employees.manage'
    );
  else
    v_preset := false;
  end if;

  select coalesce(allow, '{}'::jsonb), coalesce(deny, '{}'::jsonb)
  into v_allow, v_deny
  from public.user_permission_overrides
  where user_id = p_user_id;

  if jsonb_typeof(v_deny -> p_perm) = 'boolean' and (v_deny ->> p_perm) = 'true' then
    return false;
  end if;

  if jsonb_typeof(v_allow -> p_perm) = 'boolean' and (v_allow ->> p_perm) = 'true' then
    return true;
  end if;

  return coalesce(v_preset, false);
end;
$$;

alter table if exists public.inventory_low_stock_state enable row level security;

drop policy if exists inventory_low_stock_state_insert_role_based on public.inventory_low_stock_state;
create policy inventory_low_stock_state_insert_role_based
  on public.inventory_low_stock_state
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  );

drop policy if exists inventory_low_stock_state_update_role_based on public.inventory_low_stock_state;
create policy inventory_low_stock_state_update_role_based
  on public.inventory_low_stock_state
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  );

drop policy if exists inventory_low_stock_state_delete_role_based on public.inventory_low_stock_state;
create policy inventory_low_stock_state_delete_role_based
  on public.inventory_low_stock_state
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  );

-- Academy-related owner/admin policies should allow operations_manager too.
do $$
begin
  if to_regclass('public.academy_content') is not null then
    drop policy if exists academy_content_insert_admin on public.academy_content;
    create policy academy_content_insert_admin
    on public.academy_content
    for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
      )
    );

    drop policy if exists academy_content_update_admin on public.academy_content;
    create policy academy_content_update_admin
    on public.academy_content
    for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    )
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );

    drop policy if exists academy_content_delete_admin on public.academy_content;
    create policy academy_content_delete_admin
    on public.academy_content
    for delete
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );
  end if;

  if to_regclass('public.academy_views') is not null then
    drop policy if exists academy_views_select_admin on public.academy_views;
    create policy academy_views_select_admin
    on public.academy_views
    for select
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );
  end if;

  if to_regclass('public.academy_featured') is not null then
    drop policy if exists academy_featured_insert_admin on public.academy_featured;
    create policy academy_featured_insert_admin
    on public.academy_featured
    for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );

    drop policy if exists academy_featured_update_admin on public.academy_featured;
    create policy academy_featured_update_admin
    on public.academy_featured
    for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    )
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );

    drop policy if exists academy_featured_delete_admin on public.academy_featured;
    create policy academy_featured_delete_admin
    on public.academy_featured
    for delete
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );
  end if;

  if to_regclass('public.academy_display_prefs') is not null then
    drop policy if exists academy_display_prefs_insert_admin on public.academy_display_prefs;
    create policy academy_display_prefs_insert_admin
    on public.academy_display_prefs
    for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );

    drop policy if exists academy_display_prefs_update_admin on public.academy_display_prefs;
    create policy academy_display_prefs_update_admin
    on public.academy_display_prefs
    for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    )
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );
  end if;

  if to_regclass('public.academy_links_vehicle') is not null then
    drop policy if exists academy_links_vehicle_insert_admin on public.academy_links_vehicle;
    create policy academy_links_vehicle_insert_admin
    on public.academy_links_vehicle
    for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
      )
    );

    drop policy if exists academy_links_vehicle_update_admin on public.academy_links_vehicle;
    create policy academy_links_vehicle_update_admin
    on public.academy_links_vehicle
    for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    )
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );

    drop policy if exists academy_links_vehicle_delete_admin on public.academy_links_vehicle;
    create policy academy_links_vehicle_delete_admin
    on public.academy_links_vehicle
    for delete
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );
  end if;

  if to_regclass('public.academy_links_asset_type') is not null then
    drop policy if exists academy_links_asset_type_insert_admin on public.academy_links_asset_type;
    create policy academy_links_asset_type_insert_admin
    on public.academy_links_asset_type
    for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
      )
    );

    drop policy if exists academy_links_asset_type_update_admin on public.academy_links_asset_type;
    create policy academy_links_asset_type_update_admin
    on public.academy_links_asset_type
    for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    )
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );

    drop policy if exists academy_links_asset_type_delete_admin on public.academy_links_asset_type;
    create policy academy_links_asset_type_delete_admin
    on public.academy_links_asset_type
    for delete
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin')
      )
    );
  end if;

  if to_regclass('public.academy_links_topic') is not null then
    drop policy if exists academy_links_topic_insert_manage on public.academy_links_topic;
    create policy academy_links_topic_insert_manage
    on public.academy_links_topic
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
      )
    );

    drop policy if exists academy_links_topic_update_manage on public.academy_links_topic;
    create policy academy_links_topic_update_manage
    on public.academy_links_topic
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
      )
    )
    with check (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
      )
    );

    drop policy if exists academy_links_topic_delete_manage on public.academy_links_topic;
    create policy academy_links_topic_delete_manage
    on public.academy_links_topic
    for delete
    to authenticated
    using (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
      )
    );
  end if;
end
$$;

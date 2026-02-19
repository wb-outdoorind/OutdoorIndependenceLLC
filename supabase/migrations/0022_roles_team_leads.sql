-- Add team_lead_1 and team_lead_2 as teammate-equivalent roles.

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

  if v_role in ('employee', 'team_member_1', 'team_member_2', 'team_lead_1', 'team_lead_2') then
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

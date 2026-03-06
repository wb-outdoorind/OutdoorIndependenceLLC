-- Expand profiles.role check constraint to include current app roles.

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
      'teammate',
      'team_lead_1',
      'team_lead_2',
      'team_member_1',
      'team_member_2',
      'employee'
    )
  );

-- Add optional mechanic self-score input (0-100) to maintenance logs.

alter table public.maintenance_logs
  add column if not exists mechanic_self_score integer;

alter table public.equipment_maintenance_logs
  add column if not exists mechanic_self_score integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'maintenance_logs_mechanic_self_score_check'
  ) then
    alter table public.maintenance_logs
      add constraint maintenance_logs_mechanic_self_score_check
      check (
        mechanic_self_score is null
        or (mechanic_self_score >= 0 and mechanic_self_score <= 100)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_maintenance_logs_mechanic_self_score_check'
  ) then
    alter table public.equipment_maintenance_logs
      add constraint equipment_maintenance_logs_mechanic_self_score_check
      check (
        mechanic_self_score is null
        or (mechanic_self_score >= 0 and mechanic_self_score <= 100)
      );
  end if;
end $$;

-- Performance and integrity hardening.
-- Safe guards: each statement checks object existence before applying.

-- Frequently queried ordering/filter indexes.
create index if not exists inspections_vehicle_created_idx
  on public.inspections (vehicle_id, created_at desc);

create index if not exists maintenance_requests_vehicle_created_idx
  on public.maintenance_requests (vehicle_id, created_at desc);

create index if not exists maintenance_logs_vehicle_created_idx
  on public.maintenance_logs (vehicle_id, created_at desc);

create index if not exists equipment_maintenance_requests_equipment_created_idx
  on public.equipment_maintenance_requests (equipment_id, created_at desc);

create index if not exists equipment_maintenance_logs_equipment_created_idx
  on public.equipment_maintenance_logs (equipment_id, created_at desc);

create index if not exists form_submission_grades_submitted_at_idx
  on public.form_submission_grades (submitted_at desc);

create index if not exists form_submission_grades_accountability_idx
  on public.form_submission_grades (accountability_flag, submitted_at desc);

create index if not exists form_submission_grades_asset_vehicle_idx
  on public.form_submission_grades (vehicle_id, submitted_at desc)
  where vehicle_id is not null;

create index if not exists form_submission_grades_asset_equipment_idx
  on public.form_submission_grades (equipment_id, submitted_at desc)
  where equipment_id is not null;

create index if not exists accountability_occurrences_teammate_status_date_idx
  on public.accountability_occurrences (teammate_id, status, occurrence_date desc);

create index if not exists accountability_forms_teammate_form_date_idx
  on public.accountability_forms (teammate_id, form_date desc);

create index if not exists user_notifications_recipient_created_idx
  on public.user_notifications (recipient_id, created_at desc);

create index if not exists trend_actions_status_created_idx
  on public.trend_actions (status, created_at desc);

-- Data quality constraints for grading pipeline.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'form_submission_grades'
  ) then
    if not exists (
      select 1 from pg_constraint
      where conname = 'form_submission_grades_score_range_ck'
    ) then
      alter table public.form_submission_grades
        add constraint form_submission_grades_score_range_ck
        check (score >= 0 and score <= 100)
        not valid;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'form_submission_grades_missing_count_nonnegative_ck'
    ) then
      alter table public.form_submission_grades
        add constraint form_submission_grades_missing_count_nonnegative_ck
        check (missing_count >= 0)
        not valid;
    end if;
  end if;
end
$$;

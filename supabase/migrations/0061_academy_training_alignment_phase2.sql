-- 0061_academy_training_alignment_phase2.sql
-- Align OI Academy mowing training program with expanded operational standards.

create table if not exists public.academy_training_week_requirements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.academy_training_programs(id) on delete cascade,
  week_number integer not null check (week_number >= 1 and week_number <= 52),
  min_pass_percent integer not null default 0 check (min_pass_percent >= 0 and min_pass_percent <= 100),
  require_safety_pass boolean not null default true,
  require_quality_pass boolean not null default true,
  require_efficiency_pass boolean not null default true,
  require_no_open_incidents boolean not null default false,
  production_benchmark text null,
  quality_defect_tolerance text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_training_week_requirements_unique unique (program_id, week_number)
);

create table if not exists public.academy_training_incident_logs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.academy_training_enrollments(id) on delete cascade,
  incident_date date not null default current_date,
  incident_type text not null,
  severity text not null,
  summary text not null,
  action_taken text null,
  reported_by uuid null references public.profiles(id) on delete set null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_training_incident_logs_incident_type_check check (
    incident_type in ('near_miss', 'property_damage', 'safety_incident', 'customer_issue')
  ),
  constraint academy_training_incident_logs_severity_check check (
    severity in ('low', 'medium', 'high', 'critical')
  ),
  constraint academy_training_incident_logs_summary_nonempty check (char_length(trim(summary)) > 0)
);

create table if not exists public.academy_training_followups (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.academy_training_enrollments(id) on delete cascade,
  followup_type text not null,
  due_date date not null,
  completed_date date null,
  reviewer_id uuid null references public.profiles(id) on delete set null,
  score_percent numeric(6,2) null check (score_percent >= 0 and score_percent <= 100),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_training_followups_type_check check (
    followup_type in ('30_day', '60_day')
  ),
  constraint academy_training_followups_unique unique (enrollment_id, followup_type)
);

alter table public.academy_training_certifications
  add column if not exists final_practical_score numeric(6,2) null check (final_practical_score >= 0 and final_practical_score <= 100),
  add column if not exists safety_signoff boolean not null default false,
  add column if not exists quality_signoff boolean not null default false,
  add column if not exists efficiency_signoff boolean not null default false,
  add column if not exists workflow_signoff boolean not null default false,
  add column if not exists equipment_signoff boolean not null default false,
  add column if not exists customer_standards_signoff boolean not null default false,
  add column if not exists remediation_plan text null;

create index if not exists academy_training_week_requirements_program_week_idx
  on public.academy_training_week_requirements (program_id, week_number);

create index if not exists academy_training_incident_logs_enrollment_date_idx
  on public.academy_training_incident_logs (enrollment_id, incident_date desc);

create index if not exists academy_training_incident_logs_open_idx
  on public.academy_training_incident_logs (enrollment_id, severity)
  where resolved_at is null;

create index if not exists academy_training_followups_enrollment_due_idx
  on public.academy_training_followups (enrollment_id, due_date);

alter table if exists public.academy_training_week_requirements enable row level security;
alter table if exists public.academy_training_incident_logs enable row level security;
alter table if exists public.academy_training_followups enable row level security;

-- Reuse the standard updated_at trigger function.
drop trigger if exists trg_academy_training_week_requirements_set_updated_at on public.academy_training_week_requirements;
create trigger trg_academy_training_week_requirements_set_updated_at
before update on public.academy_training_week_requirements
for each row execute function public.set_updated_at();

drop trigger if exists trg_academy_training_incident_logs_set_updated_at on public.academy_training_incident_logs;
create trigger trg_academy_training_incident_logs_set_updated_at
before update on public.academy_training_incident_logs
for each row execute function public.set_updated_at();

drop trigger if exists trg_academy_training_followups_set_updated_at on public.academy_training_followups;
create trigger trg_academy_training_followups_set_updated_at
before update on public.academy_training_followups
for each row execute function public.set_updated_at();

-- Week requirements: everyone can read; only management/mechanic can mutate.
drop policy if exists academy_training_week_requirements_select_authenticated on public.academy_training_week_requirements;
create policy academy_training_week_requirements_select_authenticated
on public.academy_training_week_requirements
for select
to authenticated
using (true);

drop policy if exists academy_training_week_requirements_mutate_management on public.academy_training_week_requirements;
create policy academy_training_week_requirements_mutate_management
on public.academy_training_week_requirements
for all
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

-- Incident log visibility mirrors enrollment visibility.
drop policy if exists academy_training_incident_logs_select_visible_scope on public.academy_training_incident_logs;
create policy academy_training_incident_logs_select_visible_scope
on public.academy_training_incident_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.academy_training_enrollments e
    where e.id = academy_training_incident_logs.enrollment_id
      and (
        e.trainee_id = auth.uid()
        or e.trainer_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic', 'team_lead_1', 'team_lead_2')
        )
        or exists (
          select 1
          from public.profiles viewer
          where viewer.id = auth.uid()
            and viewer.role in ('team_member_1', 'team_member_2', 'employee', 'teammate')
            and coalesce(viewer.department, '') <> ''
            and viewer.department = e.department
        )
      )
  )
);

drop policy if exists academy_training_incident_logs_mutate_trainer_scope on public.academy_training_incident_logs;
create policy academy_training_incident_logs_mutate_trainer_scope
on public.academy_training_incident_logs
for all
to authenticated
using (
  exists (
    select 1
    from public.academy_training_enrollments e
    where e.id = academy_training_incident_logs.enrollment_id
      and (
        e.trainer_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic', 'team_lead_1', 'team_lead_2')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.academy_training_enrollments e
    where e.id = academy_training_incident_logs.enrollment_id
      and (
        e.trainer_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic', 'team_lead_1', 'team_lead_2')
        )
      )
  )
);

-- Followup visibility and mutations align to certification chain visibility.
drop policy if exists academy_training_followups_select_visible_scope on public.academy_training_followups;
create policy academy_training_followups_select_visible_scope
on public.academy_training_followups
for select
to authenticated
using (
  exists (
    select 1
    from public.academy_training_enrollments e
    where e.id = academy_training_followups.enrollment_id
      and (
        e.trainee_id = auth.uid()
        or e.trainer_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic', 'team_lead_1', 'team_lead_2')
        )
      )
  )
);

drop policy if exists academy_training_followups_mutate_privileged on public.academy_training_followups;
create policy academy_training_followups_mutate_privileged
on public.academy_training_followups
for all
to authenticated
using (
  exists (
    select 1
    from public.academy_training_enrollments e
    where e.id = academy_training_followups.enrollment_id
      and (
        e.trainer_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic', 'team_lead_1', 'team_lead_2')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.academy_training_enrollments e
    where e.id = academy_training_followups.enrollment_id
      and (
        e.trainer_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic', 'team_lead_1', 'team_lead_2')
        )
      )
  )
);

create or replace function public.academy_training_schedule_followups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.certification_result = 'Certified Mowing Technician'
     and new.certification_date is not null then
    insert into public.academy_training_followups (
      enrollment_id,
      followup_type,
      due_date,
      reviewer_id,
      notes
    )
    values
      (
        new.enrollment_id,
        '30_day',
        (new.certification_date + interval '30 day')::date,
        coalesce(new.updated_by, new.created_by),
        'Auto-scheduled from certification record.'
      ),
      (
        new.enrollment_id,
        '60_day',
        (new.certification_date + interval '60 day')::date,
        coalesce(new.updated_by, new.created_by),
        'Auto-scheduled from certification record.'
      )
    on conflict (enrollment_id, followup_type)
    do update set
      due_date = excluded.due_date,
      reviewer_id = coalesce(excluded.reviewer_id, public.academy_training_followups.reviewer_id),
      notes = coalesce(public.academy_training_followups.notes, excluded.notes),
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_academy_training_certifications_schedule_followups on public.academy_training_certifications;
create trigger trg_academy_training_certifications_schedule_followups
after insert or update of certification_result, certification_date, updated_by
on public.academy_training_certifications
for each row
execute function public.academy_training_schedule_followups();

-- Sync week goals with current training document language.
with program as (
  select id
  from public.academy_training_programs
  where slug = 'mowing-technician-4-week-training-certification'
),
seed as (
  select *
  from (
    values
      (1, 'Foundations', 25, 'Build field-readiness fundamentals: inspections, equipment accountability, hazard scans, Air, trimming, edging, and service-finish expectations.'),
      (2, 'Operational Development', 50, 'Develop mower operation and integrated trim/mow workflow while improving property awareness and execution consistency.'),
      (3, 'Efficiency & Quality', 75, 'Increase production pace while maintaining professional standards, quality control, and defect prevention.'),
      (4, 'Independent Technician Development', 100, 'Demonstrate independent full-property execution, consistent MEATS completion, and technician-level professionalism.')
  ) as rows(week_number, title, goal_percent, goal_description)
)
insert into public.academy_training_weeks (
  program_id,
  week_number,
  title,
  goal_percent,
  goal_description
)
select
  program.id,
  seed.week_number,
  seed.title,
  seed.goal_percent,
  seed.goal_description
from program
join seed on true
on conflict (program_id, week_number)
do update set
  title = excluded.title,
  goal_percent = excluded.goal_percent,
  goal_description = excluded.goal_description,
  updated_at = now();

-- Week pass gates and expectations.
with program as (
  select id
  from public.academy_training_programs
  where slug = 'mowing-technician-4-week-training-certification'
),
seed as (
  select *
  from (
    values
      (1, 25, true, true, false, false, 'Assist route execution without slowing crew pace.', 'No critical safety defects; major defects corrected same day.', 'Focus: safety and repeatable baseline execution.'),
      (2, 50, true, true, true, false, 'Complete assigned open sections within planned route timing.', 'No critical defects; <=2 major quality defects per route day.', 'Focus: safe mower operation and trim/mow integration.'),
      (3, 75, true, true, true, false, 'Operate at production pace with minimal rework on standard properties.', 'No critical defects; <=1 major quality defect per route day.', 'Focus: speed with quality, plus defect detection.'),
      (4, 90, true, true, true, true, 'Run full properties independently at route pace.', 'Zero critical defects and zero unresolved major defects before departure.', 'Certification week; all gates required.')
  ) as rows(
    week_number,
    min_pass_percent,
    require_safety_pass,
    require_quality_pass,
    require_efficiency_pass,
    require_no_open_incidents,
    production_benchmark,
    quality_defect_tolerance,
    notes
  )
)
insert into public.academy_training_week_requirements (
  program_id,
  week_number,
  min_pass_percent,
  require_safety_pass,
  require_quality_pass,
  require_efficiency_pass,
  require_no_open_incidents,
  production_benchmark,
  quality_defect_tolerance,
  notes
)
select
  program.id,
  seed.week_number,
  seed.min_pass_percent,
  seed.require_safety_pass,
  seed.require_quality_pass,
  seed.require_efficiency_pass,
  seed.require_no_open_incidents,
  seed.production_benchmark,
  seed.quality_defect_tolerance,
  seed.notes
from program
join seed on true
on conflict (program_id, week_number)
do update set
  min_pass_percent = excluded.min_pass_percent,
  require_safety_pass = excluded.require_safety_pass,
  require_quality_pass = excluded.require_quality_pass,
  require_efficiency_pass = excluded.require_efficiency_pass,
  require_no_open_incidents = excluded.require_no_open_incidents,
  production_benchmark = excluded.production_benchmark,
  quality_defect_tolerance = excluded.quality_defect_tolerance,
  notes = excluded.notes,
  updated_at = now();

-- Add operationally important skills missing from the original seed.
with program as (
  select id
  from public.academy_training_programs
  where slug = 'mowing-technician-4-week-training-certification'
),
seed as (
  select *
  from (
    values
      -- Week 1 additions
      (1, 'ppe_compliance_daily', 'Consistent PPE compliance (eyes, hearing, footwear, high-visibility where required)', 21),
      (1, 'safe_fueling_protocol', 'Safe fueling protocol (engine off/cool, spill prevention, approved containers)', 22),
      (1, 'weather_heat_lightning_protocol', 'Applying weather, heat, and lightning stop-work protocol', 23),
      (1, 'traffic_public_safety_awareness', 'Maintaining traffic/public safety buffer while operating tools', 24),
      (1, 'customer_property_protection', 'Protecting customer property (windows, vehicles, decor) during service', 25),
      (1, 'preexisting_damage_documentation', 'Documenting pre-existing property damage and escalation same day', 26),
      (1, 'gate_pet_toy_protocol', 'Following gate, pet, and toy protocol before starting work', 27),
      (1, 'near_miss_reporting_same_day', 'Reporting near misses and incidents in app same day', 28),

      -- Week 2 additions
      (2, 'select_deck_height_by_conditions', 'Selecting deck height based on turf condition, weather, and service standard', 18),
      (2, 'blade_condition_awareness', 'Identifying dull blade impact and reporting for replacement', 19),
      (2, 'discharge_risk_management', 'Managing discharge direction to protect beds, hardscape, and parked vehicles', 20),
      (2, 'wet_grass_adjustments', 'Adjusting speed/pattern for wet grass and heavy clipping conditions', 21),
      (2, 'route_time_blocking_basics', 'Applying basic route time blocking to stay on schedule', 22),
      (2, 'damage_escalation_protocol', 'Escalating potential property damage immediately with photo context', 23),

      -- Week 3 additions
      (3, 'defect_classification', 'Classifying defects: critical, major, minor and applying rework priority', 15),
      (3, 'rework_before_departure', 'Completing major defect rework before leaving property', 16),
      (3, 'benchmark_minutes_per_property', 'Maintaining benchmark time per property without quality drop', 17),
      (3, 'customer_handoff_escalation', 'Executing customer-facing handoff/escalation script when issues arise', 18),
      (3, 'end_of_day_tool_readiness', 'Completing end-of-day tool readiness (cleaning, line/blade checks)', 19),

      -- Week 4 additions
      (4, 'final_practical_route_assessment', 'Passing final practical route assessment at technician standard', 16),
      (4, 'zero_critical_defects_standard', 'Maintaining zero critical defects during certification week', 17),
      (4, 'certification_gate_compliance', 'Meeting all certification gates: safety, quality, efficiency, workflow, equipment, customer standards', 18),
      (4, 'followup_30_day_preparation', 'Preparing 30-day post-certification follow-up action plan', 19),
      (4, 'followup_60_day_preparation', 'Preparing 60-day post-certification follow-up action plan', 20)
  ) as rows(week_number, skill_key, skill_label, sort_order)
)
insert into public.academy_training_skills (
  program_id,
  week_number,
  skill_key,
  skill_label,
  sort_order
)
select
  program.id,
  seed.week_number,
  seed.skill_key,
  seed.skill_label,
  seed.sort_order
from program
join seed on true
on conflict (program_id, week_number, skill_key)
do update set
  skill_label = excluded.skill_label,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Backfill followups for existing certified records.
insert into public.academy_training_followups (
  enrollment_id,
  followup_type,
  due_date,
  reviewer_id,
  notes
)
select
  c.enrollment_id,
  f.followup_type,
  case when f.followup_type = '30_day'
    then (c.certification_date + interval '30 day')::date
    else (c.certification_date + interval '60 day')::date
  end as due_date,
  coalesce(c.updated_by, c.created_by) as reviewer_id,
  'Backfilled from existing certification record.' as notes
from public.academy_training_certifications c
cross join (values ('30_day'), ('60_day')) as f(followup_type)
where c.certification_result = 'Certified Mowing Technician'
  and c.certification_date is not null
on conflict (enrollment_id, followup_type)
do nothing;

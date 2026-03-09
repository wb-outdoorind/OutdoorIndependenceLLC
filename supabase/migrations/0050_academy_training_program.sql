-- 0050_academy_training_program.sql
-- OI Academy training progression system + seeded 4-week mowing technician program.

create table if not exists public.academy_training_programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  department text not null,
  program_length_weeks integer not null default 4 check (program_length_weeks >= 1 and program_length_weeks <= 52),
  focus text null,
  summary text null,
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_training_programs_department_check check (
    department in ('Mowing', 'Administration', 'Landscaping', 'Fertilizing', 'Maintenance')
  )
);

create table if not exists public.academy_training_weeks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.academy_training_programs(id) on delete cascade,
  week_number integer not null check (week_number >= 1 and week_number <= 52),
  title text not null,
  goal_percent integer not null check (goal_percent >= 0 and goal_percent <= 100),
  goal_description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_training_weeks_unique unique (program_id, week_number)
);

create table if not exists public.academy_training_skills (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.academy_training_programs(id) on delete cascade,
  week_number integer not null check (week_number >= 1 and week_number <= 52),
  skill_key text not null,
  skill_label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_training_skills_unique unique (program_id, week_number, skill_key)
);

create table if not exists public.academy_training_enrollments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.academy_training_programs(id) on delete cascade,
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  trainer_id uuid null references public.profiles(id) on delete set null,
  department text not null,
  start_date date not null,
  target_completion_date date null,
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_training_enrollments_program_trainee_unique unique (program_id, trainee_id),
  constraint academy_training_enrollments_department_check check (
    department in ('Mowing', 'Administration', 'Landscaping', 'Fertilizing', 'Maintenance')
  )
);

create table if not exists public.academy_training_daily_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.academy_training_enrollments(id) on delete cascade,
  progress_date date not null,
  week_number integer not null check (week_number >= 1 and week_number <= 52),
  trainer_id uuid null references public.profiles(id) on delete set null,
  submitted_by uuid null references public.profiles(id) on delete set null,
  completion_percent numeric(6,2) not null default 0 check (completion_percent >= 0 and completion_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_training_daily_progress_unique unique (enrollment_id, progress_date)
);

create table if not exists public.academy_training_daily_skill_progress (
  daily_progress_id uuid not null references public.academy_training_daily_progress(id) on delete cascade,
  skill_id uuid not null references public.academy_training_skills(id) on delete cascade,
  status smallint not null check (status between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (daily_progress_id, skill_id)
);

create table if not exists public.academy_training_daily_skill_notes (
  daily_progress_id uuid not null references public.academy_training_daily_progress(id) on delete cascade,
  skill_id uuid not null references public.academy_training_skills(id) on delete cascade,
  note text not null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (daily_progress_id, skill_id),
  constraint academy_training_daily_skill_notes_note_nonempty check (char_length(trim(note)) > 0)
);

create table if not exists public.academy_training_certifications (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique references public.academy_training_enrollments(id) on delete cascade,
  employee_name text not null,
  crew_leader_id uuid null references public.profiles(id) on delete set null,
  start_date date not null,
  certification_date date null,
  crew_leader_approval text null,
  operations_approval text null,
  certification_result text null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_training_certifications_result_check check (
    certification_result is null
    or certification_result in ('Certified Mowing Technician', 'Additional Training Required')
  )
);

create index if not exists academy_training_enrollments_program_idx
  on public.academy_training_enrollments (program_id, is_active, department);

create index if not exists academy_training_enrollments_trainer_idx
  on public.academy_training_enrollments (trainer_id, is_active);

create index if not exists academy_training_daily_progress_enrollment_date_idx
  on public.academy_training_daily_progress (enrollment_id, progress_date desc);

create index if not exists academy_training_skills_program_week_idx
  on public.academy_training_skills (program_id, week_number, sort_order);

alter table if exists public.academy_training_programs enable row level security;
alter table if exists public.academy_training_weeks enable row level security;
alter table if exists public.academy_training_skills enable row level security;
alter table if exists public.academy_training_enrollments enable row level security;
alter table if exists public.academy_training_daily_progress enable row level security;
alter table if exists public.academy_training_daily_skill_progress enable row level security;
alter table if exists public.academy_training_daily_skill_notes enable row level security;
alter table if exists public.academy_training_certifications enable row level security;

-- Program templates are visible to all authenticated users.
drop policy if exists academy_training_programs_select_authenticated on public.academy_training_programs;
create policy academy_training_programs_select_authenticated
on public.academy_training_programs
for select
to authenticated
using (true);

drop policy if exists academy_training_weeks_select_authenticated on public.academy_training_weeks;
create policy academy_training_weeks_select_authenticated
on public.academy_training_weeks
for select
to authenticated
using (true);

drop policy if exists academy_training_skills_select_authenticated on public.academy_training_skills;
create policy academy_training_skills_select_authenticated
on public.academy_training_skills
for select
to authenticated
using (true);

-- Program template edits are restricted to management roles.
drop policy if exists academy_training_programs_mutate_management on public.academy_training_programs;
create policy academy_training_programs_mutate_management
on public.academy_training_programs
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

drop policy if exists academy_training_weeks_mutate_management on public.academy_training_weeks;
create policy academy_training_weeks_mutate_management
on public.academy_training_weeks
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

drop policy if exists academy_training_skills_mutate_management on public.academy_training_skills;
create policy academy_training_skills_mutate_management
on public.academy_training_skills
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

-- Enrollment visibility:
-- 1) trainee self
-- 2) assigned trainer
-- 3) management + mechanic + leads
-- 4) teammates in same department (for dept dashboard visibility)
drop policy if exists academy_training_enrollments_select_visible_scope on public.academy_training_enrollments;
create policy academy_training_enrollments_select_visible_scope
on public.academy_training_enrollments
for select
to authenticated
using (
  trainee_id = auth.uid()
  or trainer_id = auth.uid()
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
      and viewer.department = academy_training_enrollments.department
  )
);

drop policy if exists academy_training_enrollments_mutate_management_or_lead on public.academy_training_enrollments;
create policy academy_training_enrollments_mutate_management_or_lead
on public.academy_training_enrollments
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic', 'team_lead_1', 'team_lead_2')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic', 'team_lead_1', 'team_lead_2')
  )
);

-- Daily progression visibility mirrors enrollment visibility (excluding notes).
drop policy if exists academy_training_daily_progress_select_visible_scope on public.academy_training_daily_progress;
create policy academy_training_daily_progress_select_visible_scope
on public.academy_training_daily_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.academy_training_enrollments e
    where e.id = academy_training_daily_progress.enrollment_id
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

drop policy if exists academy_training_daily_progress_mutate_trainer_scope on public.academy_training_daily_progress;
create policy academy_training_daily_progress_mutate_trainer_scope
on public.academy_training_daily_progress
for all
to authenticated
using (
  exists (
    select 1
    from public.academy_training_enrollments e
    where e.id = academy_training_daily_progress.enrollment_id
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
    where e.id = academy_training_daily_progress.enrollment_id
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

-- Skill progression rows use parent daily progress permissions.
drop policy if exists academy_training_daily_skill_progress_select_visible_scope on public.academy_training_daily_skill_progress;
create policy academy_training_daily_skill_progress_select_visible_scope
on public.academy_training_daily_skill_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.academy_training_daily_progress dp
    join public.academy_training_enrollments e on e.id = dp.enrollment_id
    where dp.id = academy_training_daily_skill_progress.daily_progress_id
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

drop policy if exists academy_training_daily_skill_progress_mutate_trainer_scope on public.academy_training_daily_skill_progress;
create policy academy_training_daily_skill_progress_mutate_trainer_scope
on public.academy_training_daily_skill_progress
for all
to authenticated
using (
  exists (
    select 1
    from public.academy_training_daily_progress dp
    join public.academy_training_enrollments e on e.id = dp.enrollment_id
    where dp.id = academy_training_daily_skill_progress.daily_progress_id
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
    from public.academy_training_daily_progress dp
    join public.academy_training_enrollments e on e.id = dp.enrollment_id
    where dp.id = academy_training_daily_skill_progress.daily_progress_id
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

-- Trainer notes are hidden from apprentices/team members.
drop policy if exists academy_training_daily_skill_notes_select_privileged on public.academy_training_daily_skill_notes;
create policy academy_training_daily_skill_notes_select_privileged
on public.academy_training_daily_skill_notes
for select
to authenticated
using (
  exists (
    select 1
    from public.academy_training_daily_progress dp
    join public.academy_training_enrollments e on e.id = dp.enrollment_id
    where dp.id = academy_training_daily_skill_notes.daily_progress_id
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

drop policy if exists academy_training_daily_skill_notes_mutate_privileged on public.academy_training_daily_skill_notes;
create policy academy_training_daily_skill_notes_mutate_privileged
on public.academy_training_daily_skill_notes
for all
to authenticated
using (
  exists (
    select 1
    from public.academy_training_daily_progress dp
    join public.academy_training_enrollments e on e.id = dp.enrollment_id
    where dp.id = academy_training_daily_skill_notes.daily_progress_id
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
    from public.academy_training_daily_progress dp
    join public.academy_training_enrollments e on e.id = dp.enrollment_id
    where dp.id = academy_training_daily_skill_notes.daily_progress_id
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

-- Certification visibility includes trainee and trainer chain.
drop policy if exists academy_training_certifications_select_visible_scope on public.academy_training_certifications;
create policy academy_training_certifications_select_visible_scope
on public.academy_training_certifications
for select
to authenticated
using (
  exists (
    select 1
    from public.academy_training_enrollments e
    where e.id = academy_training_certifications.enrollment_id
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

drop policy if exists academy_training_certifications_mutate_privileged on public.academy_training_certifications;
create policy academy_training_certifications_mutate_privileged
on public.academy_training_certifications
for all
to authenticated
using (
  exists (
    select 1
    from public.academy_training_enrollments e
    where e.id = academy_training_certifications.enrollment_id
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
    where e.id = academy_training_certifications.enrollment_id
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

-- Seed: Mowing Technician 4-Week Training & Certification Program
insert into public.academy_training_programs (
  slug,
  name,
  department,
  program_length_weeks,
  focus,
  summary,
  is_active
)
values (
  'mowing-technician-4-week-training-certification',
  'Mowing Technician 4-Week Training & Certification Program',
  'Mowing',
  4,
  'Field training progression from beginner to independent mowing technician across 4 weeks.',
  'Week 1 = Foundations; Week 2 = Operational/independent readiness; Week 3 = Refinement and consistency; Week 4 = Excellence and certification.',
  true
)
on conflict (slug)
do update set
  name = excluded.name,
  department = excluded.department,
  program_length_weeks = excluded.program_length_weeks,
  focus = excluded.focus,
  summary = excluded.summary,
  is_active = excluded.is_active,
  updated_at = now();

with program as (
  select id
  from public.academy_training_programs
  where slug = 'mowing-technician-4-week-training-certification'
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
cross join (
  values
    (1, 'Foundations', 25, 'Teach equipment responsibility, property expectations, Air, string trimmer basics, edging, and trimming foundations.'),
    (2, 'Mower Development', 50, 'Build safe mower operation, mowing confidence, and understanding of how mowing and trimming interact.'),
    (3, 'Efficiency & Quality', 75, 'Refine production speed, consistency, quality control, and property awareness.'),
    (4, 'Independent Technician Development', 100, 'Develop an excellent technician who can execute properties independently while maintaining Outdoor Independence LLC standards.')
) as seed(week_number, title, goal_percent, goal_description)
on conflict (program_id, week_number)
do update set
  title = excluded.title,
  goal_percent = excluded.goal_percent,
  goal_description = excluded.goal_description,
  updated_at = now();

with program as (
  select id
  from public.academy_training_programs
  where slug = 'mowing-technician-4-week-training-certification'
),
seed as (
  select *
  from (
    values
      -- Week 1
      (1, 'truck_trailer_organization', 'Truck and trailer organization', 1),
      (1, 'load_unload_equipment_safely', 'Loading and unloading equipment safely', 2),
      (1, 'complete_pretrip_in_app', 'Completing pre-trip inspections in the Outdoor Independence LLC App', 3),
      (1, 'complete_posttrip_in_app', 'Completing post-trip inspections in the Outdoor Independence LLC App', 4),
      (1, 'report_maintenance_in_app', 'Reporting maintenance issues in the app', 5),
      (1, 'property_walkthrough_before_work', 'Property walkthrough before work begins', 6),
      (1, 'identify_hazards_obstacles', 'Identifying hazards and obstacles', 7),
      (1, 'property_pickup_before_mowing', 'Property pickup before mowing', 8),
      (1, 'operate_backpack_blower_safely', 'Operating backpack blower safely', 9),
      (1, 'use_hand_blower_appropriately', 'Using hand blower appropriately', 10),
      (1, 'clean_sidewalks_driveways', 'Cleaning sidewalks and driveways', 11),
      (1, 'blow_clippings_back_into_turf', 'Blowing clippings back into turf', 12),
      (1, 'avoid_blowing_debris_into_beds_buildings', 'Avoiding blowing debris into beds/buildings', 13),
      (1, 'safe_string_trimmer_handling', 'Safe string trimmer handling', 14),
      (1, 'consistent_trimming_height', 'Maintaining consistent trimming height', 15),
      (1, 'avoid_scalping_turf', 'Avoiding scalping turf', 16),
      (1, 'controlled_trimmer_movement', 'Maintaining controlled trimmer movement', 17),
      (1, 'rotate_trimmer_for_edging', 'Rotating trimmer correctly for edging', 18),
      (1, 'straight_sidewalk_edges', 'Producing straight sidewalk edges', 19),
      (1, 'consistent_edge_depth', 'Maintaining consistent edge depth', 20),
      -- Week 2
      (2, 'understand_mower_controls', 'Understanding mower controls', 1),
      (2, 'safe_start_shutdown_mower', 'Starting and shutting down mower safely', 2),
      (2, 'blade_engage_disengage_correctly', 'Engaging/disengaging blades correctly', 3),
      (2, 'smooth_driving_control', 'Smooth driving control', 4),
      (2, 'safe_turns_and_stopping', 'Safe turns and stopping', 5),
      (2, 'straight_mowing_lines', 'Driving straight mowing lines', 6),
      (2, 'proper_overlap', 'Maintaining proper overlap', 7),
      (2, 'avoid_missed_strips', 'Avoiding missed strips', 8),
      (2, 'consistent_mowing_speed', 'Maintaining consistent mowing speed', 9),
      (2, 'understand_mowing_patterns', 'Understanding mowing patterns', 10),
      (2, 'adjust_direction_for_layout', 'Adjusting mowing direction for the property layout', 11),
      (2, 'consistent_turf_appearance', 'Maintaining consistent turf appearance', 12),
      (2, 'recognize_mower_access_limits', 'Recognizing mower access limitations', 13),
      (2, 'coordinate_trimming_with_mowing', 'Coordinating trimming with mowing', 14),
      (2, 'match_trim_with_mow_height', 'Matching trim height with mowing height', 15),
      (2, 'property_checks_before_during_after', 'Performing property checks before, during, and after service', 16),
      (2, 'understand_mow_trim_interaction', 'Understanding how mowing and trimming interact on a finished property', 17),
      -- Week 3
      (3, 'move_through_properties_efficiently', 'Moving through properties efficiently', 1),
      (3, 'avoid_unnecessary_double_work', 'Avoiding unnecessary double work', 2),
      (3, 'maintain_productive_pace', 'Maintaining productive pace', 3),
      (3, 'clean_bed_edges', 'Producing clean bed edges', 4),
      (3, 'consistent_trim_quality', 'Maintaining consistent trim quality', 5),
      (3, 'avoid_turf_damage', 'Avoiding turf damage', 6),
      (3, 'straight_mowing_lines_consistent', 'Producing straight mowing lines consistently', 7),
      (3, 'smooth_turns_lawn_edges', 'Performing smooth turns at lawn edges', 8),
      (3, 'consistent_mowing_finish', 'Maintaining consistent mowing finish', 9),
      (3, 'recognize_missed_mowing_areas', 'Recognizing missed mowing areas', 10),
      (3, 'identify_missed_trimming_spots', 'Identifying missed trimming spots', 11),
      (3, 'notice_clippings_hard_surfaces', 'Noticing clippings left on hard surfaces', 12),
      (3, 'improve_three_sixty_awareness', 'Improving Three-Sixty awareness', 13),
      (3, 'catch_quality_issues_before_leave', 'Catching quality issues before leaving the property', 14),
      -- Week 4
      (4, 'independent_property_walkthrough', 'Performing property walkthrough independently', 1),
      (4, 'plan_mowing_route_before_start', 'Planning mowing route before starting', 2),
      (4, 'complete_sections_independently', 'Completing property sections independently', 3),
      (4, 'complete_mow_step_correctly', 'Completing the Mow step correctly', 4),
      (4, 'complete_edge_step_consistently', 'Completing the Edge step consistently', 5),
      (4, 'complete_air_cleanup_thoroughly', 'Completing Air cleanup thoroughly', 6),
      (4, 'perform_three_sixty_inspection', 'Performing the Three-Sixty inspection', 7),
      (4, 'handle_slopes_safely', 'Handling slopes safely', 8),
      (4, 'navigate_tight_areas_obstacles', 'Navigating tight areas and obstacles', 9),
      (4, 'adjust_technique_for_conditions', 'Adjusting mowing technique for conditions', 10),
      (4, 'demonstrate_property_quality_control', 'Demonstrating property quality control', 11),
      (4, 'recognize_equipment_problems_early', 'Recognizing equipment problems early', 12),
      (4, 'report_equipment_issues_in_app', 'Reporting equipment issues in the app', 13),
      (4, 'maintain_professional_work_habits', 'Maintaining professional work habits', 14),
      (4, 'complete_meats_independently', 'Completing full MEATS workflow independently', 15)
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

-- Auto-enroll existing mowing apprentices into the program.
with program as (
  select id
  from public.academy_training_programs
  where slug = 'mowing-technician-4-week-training-certification'
),
apprentices as (
  select p.id, p.department
  from public.profiles p
  where p.role = 'apprentice'
    and p.department = 'Mowing'
)
insert into public.academy_training_enrollments (
  program_id,
  trainee_id,
  trainer_id,
  department,
  start_date,
  target_completion_date,
  is_active,
  created_by
)
select
  program.id,
  apprentices.id,
  null,
  apprentices.department,
  current_date,
  current_date + 28,
  true,
  null
from program
join apprentices on true
on conflict (program_id, trainee_id)
do nothing;

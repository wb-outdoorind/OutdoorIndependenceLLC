create table if not exists public.form_submission_grades (
  id bigint generated always as identity primary key,
  form_type text not null,
  form_id text not null,
  submitted_at timestamptz not null,
  submitted_by text null,
  vehicle_id text null,
  equipment_id text null,
  score integer not null default 0,
  is_complete boolean not null default false,
  has_na boolean not null default false,
  missing_count integer not null default 0,
  missing_fields jsonb not null default '[]'::jsonb,
  accountability_flag boolean not null default false,
  accountability_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_submission_grades_form_type_not_blank check (char_length(trim(form_type)) > 0),
  constraint form_submission_grades_form_id_not_blank check (char_length(trim(form_id)) > 0),
  constraint form_submission_grades_score_range check (score >= 0 and score <= 100),
  constraint form_submission_grades_missing_count_non_negative check (missing_count >= 0)
);

create unique index if not exists form_submission_grades_form_unique
  on public.form_submission_grades (form_type, form_id);

create index if not exists form_submission_grades_submitted_at_idx
  on public.form_submission_grades (submitted_at desc);

create index if not exists form_submission_grades_accountability_idx
  on public.form_submission_grades (accountability_flag, submitted_at desc);

create index if not exists form_submission_grades_submitted_by_idx
  on public.form_submission_grades (submitted_by);

create index if not exists form_submission_grades_vehicle_id_idx
  on public.form_submission_grades (vehicle_id);

create index if not exists form_submission_grades_equipment_id_idx
  on public.form_submission_grades (equipment_id);

alter table if exists public.form_submission_grades enable row level security;

drop policy if exists form_submission_grades_select_owner_ops on public.form_submission_grades;
create policy form_submission_grades_select_owner_ops
  on public.form_submission_grades
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager')
    )
  );

-- Keep writes service-side via service role routes only.

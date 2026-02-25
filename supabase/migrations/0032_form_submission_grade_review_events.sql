create table if not exists public.form_submission_grade_review_events (
  id bigserial primary key,
  grade_id bigint not null references public.form_submission_grades(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  from_owner_id uuid references public.profiles(id) on delete set null,
  to_owner_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  constraint form_submission_grade_review_events_type_check
    check (event_type in ('assign','release','mark_in_review','resolve'))
);

create index if not exists form_submission_grade_review_events_grade_idx
  on public.form_submission_grade_review_events (grade_id, created_at desc);

create index if not exists form_submission_grade_review_events_actor_idx
  on public.form_submission_grade_review_events (actor_id, created_at desc);

alter table if exists public.form_submission_grade_review_events enable row level security;

drop policy if exists form_submission_grade_review_events_select_manager on public.form_submission_grade_review_events;
create policy form_submission_grade_review_events_select_manager
  on public.form_submission_grade_review_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists form_submission_grade_review_events_insert_manager on public.form_submission_grade_review_events;
create policy form_submission_grade_review_events_insert_manager
  on public.form_submission_grade_review_events
  for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

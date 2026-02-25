create table if not exists public.form_submission_grade_likes (
  id bigserial primary key,
  grade_id bigint not null references public.form_submission_grades(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint form_submission_grade_likes_unique unique (grade_id, user_id)
);

create index if not exists form_submission_grade_likes_grade_idx
  on public.form_submission_grade_likes (grade_id, created_at desc);

create index if not exists form_submission_grade_likes_user_idx
  on public.form_submission_grade_likes (user_id, created_at desc);

alter table if exists public.form_submission_grade_likes enable row level security;

drop policy if exists form_submission_grade_likes_select_manager on public.form_submission_grade_likes;
create policy form_submission_grade_likes_select_manager
  on public.form_submission_grade_likes
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

drop policy if exists form_submission_grade_likes_insert_manager on public.form_submission_grade_likes;
create policy form_submission_grade_likes_insert_manager
  on public.form_submission_grade_likes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists form_submission_grade_likes_delete_manager on public.form_submission_grade_likes;
create policy form_submission_grade_likes_delete_manager
  on public.form_submission_grade_likes
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

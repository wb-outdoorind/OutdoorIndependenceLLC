create table if not exists public.form_submission_grade_reviews (
  id bigserial primary key,
  grade_id bigint not null references public.form_submission_grades(id) on delete cascade,
  review_status text not null default 'open',
  owner_id uuid references public.profiles(id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_submission_grade_reviews_unique unique (grade_id),
  constraint form_submission_grade_reviews_status_check
    check (review_status in ('open','in_review','resolved'))
);

create index if not exists form_submission_grade_reviews_status_idx
  on public.form_submission_grade_reviews (review_status, updated_at desc);

create index if not exists form_submission_grade_reviews_owner_idx
  on public.form_submission_grade_reviews (owner_id, updated_at desc);

create or replace function public.form_submission_grade_reviews_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_form_submission_grade_reviews_updated_at on public.form_submission_grade_reviews;
create trigger trg_form_submission_grade_reviews_updated_at
before update on public.form_submission_grade_reviews
for each row execute function public.form_submission_grade_reviews_set_updated_at();

alter table if exists public.form_submission_grade_reviews enable row level security;

drop policy if exists form_submission_grade_reviews_select_manager on public.form_submission_grade_reviews;
create policy form_submission_grade_reviews_select_manager
  on public.form_submission_grade_reviews
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

drop policy if exists form_submission_grade_reviews_insert_manager on public.form_submission_grade_reviews;
create policy form_submission_grade_reviews_insert_manager
  on public.form_submission_grade_reviews
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists form_submission_grade_reviews_update_manager on public.form_submission_grade_reviews;
create policy form_submission_grade_reviews_update_manager
  on public.form_submission_grade_reviews
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists form_submission_grade_reviews_delete_manager on public.form_submission_grade_reviews;
create policy form_submission_grade_reviews_delete_manager
  on public.form_submission_grade_reviews
  for delete
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

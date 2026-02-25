create table if not exists public.accountability_forms (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  teammate_id uuid not null references public.profiles(id) on delete restrict,
  manager_id uuid not null references public.profiles(id) on delete restrict,
  category text not null
    check (category in ('attendance', 'quality', 'safety', 'procedural')),
  form_date date not null default current_date,
  disciplinary_step text not null
    check (disciplinary_step in ('Step 1', 'Step 2', 'Step 3', 'Step 4')),
  reason_details jsonb not null default '{}'::jsonb,
  supervisor_explanation text not null default '',
  employee_response text not null default '',
  action_plan text not null default '',
  support_flags jsonb not null default '{}'::jsonb,
  support_other text,
  followup_meeting_date date,
  linked_occurrence_id bigint,
  employee_signature text,
  manager_signature text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.accountability_occurrences (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  teammate_id uuid not null references public.profiles(id) on delete restrict,
  manager_id uuid not null references public.profiles(id) on delete restrict,
  category text not null
    check (category in ('attendance', 'quality', 'safety', 'procedural')),
  occurrence_type text not null,
  occurrence_date date not null,
  step_of_program text not null
    check (step_of_program in ('Step 1', 'Step 2', 'Step 3', 'Step 4')),
  falloff_date date not null,
  status text not null default 'Active'
    check (status in ('Active', 'Complete')),
  meeting_date date,
  linked_form_id bigint references public.accountability_forms(id) on delete set null,
  immediate_termination boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.accountability_forms
  add constraint accountability_forms_linked_occurrence_fk
  foreign key (linked_occurrence_id)
  references public.accountability_occurrences(id)
  on delete set null;

create index if not exists accountability_occurrences_category_status_idx
  on public.accountability_occurrences (category, status, occurrence_date desc);
create index if not exists accountability_occurrences_teammate_idx
  on public.accountability_occurrences (teammate_id, occurrence_date desc);
create index if not exists accountability_occurrences_falloff_idx
  on public.accountability_occurrences (falloff_date, status);
create index if not exists accountability_forms_category_date_idx
  on public.accountability_forms (category, form_date desc);
create index if not exists accountability_forms_teammate_idx
  on public.accountability_forms (teammate_id, form_date desc);

create or replace function public.accountability_calc_falloff_date(
  step_value text,
  occurrence_value date
)
returns date
language plpgsql
as $$
begin
  if step_value = 'Step 1' then
    return occurrence_value + interval '3 months';
  elsif step_value = 'Step 2' then
    return occurrence_value + interval '2 months';
  elsif step_value = 'Step 3' then
    return occurrence_value + interval '1 month';
  end if;
  return occurrence_value + interval '1 month';
end;
$$;

create or replace function public.accountability_occurrence_set_defaults()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.falloff_date := public.accountability_calc_falloff_date(new.step_of_program, new.occurrence_date);
  if new.falloff_date < current_date then
    new.status := 'Complete';
  elsif new.status is null or trim(new.status) = '' then
    new.status := 'Active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_accountability_occurrence_set_defaults on public.accountability_occurrences;
create trigger trg_accountability_occurrence_set_defaults
before insert or update on public.accountability_occurrences
for each row
execute function public.accountability_occurrence_set_defaults();

create or replace function public.accountability_forms_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_accountability_forms_set_updated_at on public.accountability_forms;
create trigger trg_accountability_forms_set_updated_at
before update on public.accountability_forms
for each row
execute function public.accountability_forms_set_updated_at();

alter table public.accountability_occurrences enable row level security;
alter table public.accountability_forms enable row level security;

drop policy if exists accountability_occurrences_select_policy on public.accountability_occurrences;
create policy accountability_occurrences_select_policy
  on public.accountability_occurrences
  for select
  to authenticated
  using (
    teammate_id = auth.uid()
    or manager_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists accountability_occurrences_insert_policy on public.accountability_occurrences;
create policy accountability_occurrences_insert_policy
  on public.accountability_occurrences
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists accountability_occurrences_update_policy on public.accountability_occurrences;
create policy accountability_occurrences_update_policy
  on public.accountability_occurrences
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

drop policy if exists accountability_occurrences_delete_policy on public.accountability_occurrences;
create policy accountability_occurrences_delete_policy
  on public.accountability_occurrences
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

drop policy if exists accountability_forms_select_policy on public.accountability_forms;
create policy accountability_forms_select_policy
  on public.accountability_forms
  for select
  to authenticated
  using (
    teammate_id = auth.uid()
    or manager_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists accountability_forms_insert_policy on public.accountability_forms;
create policy accountability_forms_insert_policy
  on public.accountability_forms
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists accountability_forms_update_policy on public.accountability_forms;
create policy accountability_forms_update_policy
  on public.accountability_forms
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

drop policy if exists accountability_forms_delete_policy on public.accountability_forms;
create policy accountability_forms_delete_policy
  on public.accountability_forms
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

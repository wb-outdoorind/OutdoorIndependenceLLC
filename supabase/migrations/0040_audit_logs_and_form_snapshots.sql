-- Audit trail + immutable form snapshots.

create table if not exists public.audit_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  action text null,
  table_name text null,
  record_id text null,
  meta jsonb null,
  actor_id uuid null,
  actor_role text null,
  event_type text null,
  entity_type text null,
  entity_id text null,
  before_data jsonb null,
  after_data jsonb null
);

alter table public.audit_logs
  add column if not exists actor_id uuid null,
  add column if not exists actor_role text null,
  add column if not exists event_type text null,
  add column if not exists entity_type text null,
  add column if not exists entity_id text null,
  add column if not exists before_data jsonb null,
  add column if not exists after_data jsonb null;

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_event_entity_idx
  on public.audit_logs (event_type, entity_type, created_at desc);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_management_and_mechanic on public.audit_logs;
create policy audit_logs_select_management_and_mechanic
  on public.audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  );

drop policy if exists audit_logs_insert_authenticated on public.audit_logs;
create policy audit_logs_insert_authenticated
  on public.audit_logs
  for insert
  to authenticated
  with check (true);

create table if not exists public.form_submission_snapshots (
  id bigserial primary key,
  form_type text not null,
  form_id text not null,
  captured_at timestamptz not null default now(),
  captured_by uuid null,
  source_table text not null,
  payload jsonb not null,
  payload_hash text not null
);

alter table public.form_submission_snapshots
  add column if not exists captured_by uuid null,
  add column if not exists source_table text null,
  add column if not exists payload_hash text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'form_submission_snapshots_form_type_form_id_key'
  ) then
    alter table public.form_submission_snapshots
      add constraint form_submission_snapshots_form_type_form_id_key unique (form_type, form_id);
  end if;
end
$$;

create index if not exists form_submission_snapshots_form_idx
  on public.form_submission_snapshots (form_type, form_id);
create index if not exists form_submission_snapshots_captured_at_idx
  on public.form_submission_snapshots (captured_at desc);

alter table public.form_submission_snapshots enable row level security;

drop policy if exists form_submission_snapshots_select_management_and_mechanic on public.form_submission_snapshots;
create policy form_submission_snapshots_select_management_and_mechanic
  on public.form_submission_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'office_admin', 'mechanic')
    )
  );

drop policy if exists form_submission_snapshots_insert_authenticated on public.form_submission_snapshots;
create policy form_submission_snapshots_insert_authenticated
  on public.form_submission_snapshots
  for insert
  to authenticated
  with check (captured_by is null or captured_by = auth.uid());


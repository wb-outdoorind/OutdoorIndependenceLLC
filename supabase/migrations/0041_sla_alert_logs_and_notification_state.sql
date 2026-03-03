-- SLA observability + notification close-loop state.

create table if not exists public.sla_alert_run_logs (
  id bigint generated always as identity primary key,
  run_source text not null check (run_source in ('cron', 'manual')),
  initiated_by uuid null references public.profiles(id) on delete set null,
  ran_at timestamptz not null default now(),
  success boolean not null default true,
  skipped boolean not null default false,
  date_key text null,
  approval_overdue integer not null default 0 check (approval_overdue >= 0),
  maintenance_overdue integer not null default 0 check (maintenance_overdue >= 0),
  flagged_overdue integer not null default 0 check (flagged_overdue >= 0),
  notifications_attempted integer not null default 0 check (notifications_attempted >= 0),
  error_message text null,
  meta jsonb null
);

create index if not exists sla_alert_run_logs_ran_at_idx
  on public.sla_alert_run_logs (ran_at desc);

create index if not exists sla_alert_run_logs_success_idx
  on public.sla_alert_run_logs (success, ran_at desc);

alter table if exists public.sla_alert_run_logs enable row level security;

drop policy if exists sla_alert_run_logs_select_management on public.sla_alert_run_logs;
create policy sla_alert_run_logs_select_management
  on public.sla_alert_run_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'Active'
        and p.role in ('owner','operations_manager','office_admin','mechanic')
    )
  );

-- Service-side inserts only (via service-role API routes).

alter table if exists public.user_notifications
  add column if not exists acknowledged_at timestamptz null,
  add column if not exists resolved_at timestamptz null;

create index if not exists user_notifications_recipient_unresolved_idx
  on public.user_notifications (recipient_id, resolved_at, created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'user_notifications'
  ) then
    if not exists (
      select 1 from pg_constraint
      where conname = 'user_notifications_resolved_requires_ack_ck'
    ) then
      alter table public.user_notifications
        add constraint user_notifications_resolved_requires_ack_ck
        check (resolved_at is null or acknowledged_at is not null)
        not valid;
    end if;
  end if;
end
$$;

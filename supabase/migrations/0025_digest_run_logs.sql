create table if not exists public.digest_run_logs (
  id bigint generated always as identity primary key,
  run_source text not null check (run_source in ('cron', 'manual')),
  initiated_by uuid null references public.profiles(id) on delete set null,
  ran_at timestamptz not null default now(),
  success boolean not null default false,
  skipped boolean not null default false,
  date_key text null,
  sent_to integer not null default 0,
  open_count integer not null default 0,
  in_review_count integer not null default 0,
  email_attempted integer not null default 0,
  email_sent integer not null default 0,
  email_failed integer not null default 0,
  error_message text null,
  meta jsonb null
);

create index if not exists digest_run_logs_ran_at_idx
  on public.digest_run_logs (ran_at desc);

alter table public.digest_run_logs enable row level security;

drop policy if exists digest_run_logs_select_owner_mechanic on public.digest_run_logs;
create policy digest_run_logs_select_owner_mechanic
  on public.digest_run_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'mechanic')
    )
  );

-- Inserts are service-side only.

create table if not exists public.system_job_state (
  key text primary key,
  last_run_at timestamptz null,
  last_run_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint system_job_state_key_not_blank check (char_length(trim(key)) > 0)
);

alter table public.system_job_state enable row level security;

drop policy if exists system_job_state_select_owner_mechanic on public.system_job_state;
create policy system_job_state_select_owner_mechanic
  on public.system_job_state
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

-- Writes are service-side only.

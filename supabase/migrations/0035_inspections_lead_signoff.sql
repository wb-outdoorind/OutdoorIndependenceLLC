alter table if exists public.inspections
  add column if not exists lead_approver_id uuid references public.profiles(id) on delete set null,
  add column if not exists lead_approval_status text not null default 'not_requested',
  add column if not exists lead_approval_requested_at timestamptz null,
  add column if not exists lead_approved_at timestamptz null,
  add column if not exists lead_approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists lead_approval_note text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inspections_lead_approval_status_allowed'
  ) then
    alter table public.inspections
      add constraint inspections_lead_approval_status_allowed
      check (lead_approval_status in ('not_requested', 'pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists inspections_lead_approval_pending_idx
  on public.inspections (lead_approver_id, lead_approval_status, lead_approval_requested_at desc);

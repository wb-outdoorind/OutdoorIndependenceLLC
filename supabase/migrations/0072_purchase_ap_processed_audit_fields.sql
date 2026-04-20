-- Add explicit AP processing audit fields for purchase workflow hardening.

begin;

alter table public.purchase_requests
  add column if not exists ap_processed_by uuid null references auth.users(id) on delete set null,
  add column if not exists ap_processed_at timestamptz null;

update public.purchase_requests
set
  ap_processed_by = coalesce(ap_processed_by, ap_reviewed_by),
  ap_processed_at = coalesce(ap_processed_at, ap_reviewed_at)
where ap_processed_by is null
   or ap_processed_at is null;

commit;


-- Store finalized purchase-detail fields for approved purchases.

begin;

alter table public.purchase_requests
  add column if not exists detail_purchase_date date null,
  add column if not exists detail_total_amount numeric(12,2) null,
  add column if not exists detail_purchase_method text null,
  add column if not exists detail_purchase_method_other text null,
  add column if not exists detail_purpose text null,
  add column if not exists detail_reimbursable boolean null,
  add column if not exists detail_receipt_attached boolean null,
  add column if not exists detail_comments text null,
  add column if not exists detail_manager_signature text null,
  add column if not exists detail_manager_approved_date date null,
  add column if not exists detail_submitted_at timestamptz null;

alter table public.purchase_requests
  drop constraint if exists purchase_requests_detail_total_amount_check;

alter table public.purchase_requests
  add constraint purchase_requests_detail_total_amount_check
  check (
    detail_total_amount is null
    or detail_total_amount >= 0
  );

alter table public.purchase_requests
  drop constraint if exists purchase_requests_detail_purchase_method_check;

alter table public.purchase_requests
  add constraint purchase_requests_detail_purchase_method_check
  check (
    detail_purchase_method is null
    or detail_purchase_method in ('Credit Card', 'Debit Card', 'Cash', 'Check', 'Company Charge Account', 'Other')
  );

commit;

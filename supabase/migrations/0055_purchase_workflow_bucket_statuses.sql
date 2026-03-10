-- Revise purchase workflow buckets to match approval and maintenance-detail lifecycle.

begin;

update public.purchase_requests
set overall_status = case overall_status
  when 'pending_manager_approval' then 'waiting_operations_manager_approval'
  when 'pending_ap_approval' then 'waiting_ap_department_approval'
  when 'approved' then 'approved_purchases'
  when 'partially_approved' then 'approved_purchases'
  when 'completed' then 'past_purchases'
  else overall_status
end
where overall_status in (
  'pending_manager_approval',
  'pending_ap_approval',
  'approved',
  'partially_approved',
  'completed'
);

alter table public.purchase_requests
  drop constraint if exists purchase_requests_overall_status_check;

alter table public.purchase_requests
  add constraint purchase_requests_overall_status_check
  check (
    overall_status in (
      'waiting_operations_manager_approval',
      'waiting_ap_department_approval',
      'approved_purchases',
      'past_purchases',
      'completed',
      'denied'
    )
  );

alter table public.purchase_requests
  alter column overall_status set default 'waiting_operations_manager_approval';

commit;

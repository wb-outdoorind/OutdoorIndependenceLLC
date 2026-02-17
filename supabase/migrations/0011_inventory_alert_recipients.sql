-- 0011_inventory_alert_recipients.sql
-- Employee/profile-based inventory alert recipients.

create table if not exists public.inventory_alert_recipients (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  is_enabled boolean not null default true
);

alter table public.inventory_alert_recipients enable row level security;

drop policy if exists inventory_alert_recipients_select_authenticated on public.inventory_alert_recipients;
create policy inventory_alert_recipients_select_authenticated
  on public.inventory_alert_recipients
  for select
  to authenticated
  using (true);

drop policy if exists inventory_alert_recipients_insert_role_based on public.inventory_alert_recipients;
create policy inventory_alert_recipients_insert_role_based
  on public.inventory_alert_recipients
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin', 'mechanic')
    )
  );

drop policy if exists inventory_alert_recipients_update_role_based on public.inventory_alert_recipients;
create policy inventory_alert_recipients_update_role_based
  on public.inventory_alert_recipients
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin', 'mechanic')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin', 'mechanic')
    )
  );

drop policy if exists inventory_alert_recipients_delete_role_based on public.inventory_alert_recipients;
create policy inventory_alert_recipients_delete_role_based
  on public.inventory_alert_recipients
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'office_admin', 'mechanic')
    )
  );

insert into public.inventory_alert_recipients (profile_id, is_enabled)
select p.id, true
from public.profiles p
where lower(trim(p.email)) = 'wb@outdoorind.org'
on conflict (profile_id)
do update set is_enabled = excluded.is_enabled;

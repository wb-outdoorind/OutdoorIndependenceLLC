-- Estimate Drafts (Phase 1 persistence)
-- Stores the foundation header for William-only estimate workflow work.

create table if not exists public.estimate_drafts (
  id text primary key,
  client_id text not null references public.crm_clients(id) on delete cascade,
  property_id text not null references public.crm_properties(id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  service_line text not null check (service_line in ('maintenance', 'fertilizing', 'snow', 'landscape')),
  target_start date null,
  internal_notes text null,
  stage text not null default 'scope_pricing' check (stage in ('scope_pricing', 'review_ready', 'sent')),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimate_drafts_updated_at_idx
  on public.estimate_drafts (updated_at desc);

create index if not exists estimate_drafts_client_idx
  on public.estimate_drafts (client_id, updated_at desc);

create index if not exists estimate_drafts_property_idx
  on public.estimate_drafts (property_id, updated_at desc);

create index if not exists estimate_drafts_stage_idx
  on public.estimate_drafts (stage, updated_at desc);

drop trigger if exists trg_estimate_drafts_updated_at on public.estimate_drafts;
create trigger trg_estimate_drafts_updated_at
before update on public.estimate_drafts
for each row execute function public.set_updated_at();

alter table public.estimate_drafts enable row level security;

drop policy if exists estimate_drafts_select_william on public.estimate_drafts;
create policy estimate_drafts_select_william
  on public.estimate_drafts
  for select
  to authenticated
  using (
    auth.uid() is not null
    and public.has_permission(auth.uid(), 'employees.manage')
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'wb@outdoorind.org'
  );

drop policy if exists estimate_drafts_insert_william on public.estimate_drafts;
create policy estimate_drafts_insert_william
  on public.estimate_drafts
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and public.has_permission(auth.uid(), 'employees.manage')
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'wb@outdoorind.org'
  );

drop policy if exists estimate_drafts_update_william on public.estimate_drafts;
create policy estimate_drafts_update_william
  on public.estimate_drafts
  for update
  to authenticated
  using (
    auth.uid() is not null
    and public.has_permission(auth.uid(), 'employees.manage')
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'wb@outdoorind.org'
  )
  with check (
    auth.uid() is not null
    and public.has_permission(auth.uid(), 'employees.manage')
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'wb@outdoorind.org'
  );

drop policy if exists estimate_drafts_delete_william on public.estimate_drafts;
create policy estimate_drafts_delete_william
  on public.estimate_drafts
  for delete
  to authenticated
  using (
    auth.uid() is not null
    and public.has_permission(auth.uid(), 'employees.manage')
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'wb@outdoorind.org'
  );

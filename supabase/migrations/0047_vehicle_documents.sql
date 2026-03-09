-- Vehicle documents (registration + insurance PDF uploads)

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id text not null references public.vehicles(id) on delete cascade,
  doc_type text not null check (doc_type in ('registration', 'insurance')),
  file_name text not null,
  storage_bucket text not null default 'vehicle_docs',
  storage_path text not null,
  uploaded_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_documents_vehicle_doc_type_key unique (vehicle_id, doc_type)
);

create index if not exists vehicle_documents_vehicle_created_idx
  on public.vehicle_documents (vehicle_id, created_at desc);

-- Keep updated_at current

drop trigger if exists trg_vehicle_documents_updated_at on public.vehicle_documents;
create trigger trg_vehicle_documents_updated_at
before update on public.vehicle_documents
for each row execute function public.set_updated_at();

-- Ensure bucket exists for private PDF storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle_docs', 'vehicle_docs', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

alter table public.vehicle_documents enable row level security;

drop policy if exists vehicle_documents_select_view on public.vehicle_documents;
create policy vehicle_documents_select_view
  on public.vehicle_documents
  for select
  to authenticated
  using (public.has_permission(auth.uid(), 'vehicles.view'));

drop policy if exists vehicle_documents_insert_manage on public.vehicle_documents;
create policy vehicle_documents_insert_manage
  on public.vehicle_documents
  for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'maintenance.manage'));

drop policy if exists vehicle_documents_update_manage on public.vehicle_documents;
create policy vehicle_documents_update_manage
  on public.vehicle_documents
  for update
  to authenticated
  using (public.has_permission(auth.uid(), 'maintenance.manage'))
  with check (public.has_permission(auth.uid(), 'maintenance.manage'));

drop policy if exists vehicle_documents_delete_manage on public.vehicle_documents;
create policy vehicle_documents_delete_manage
  on public.vehicle_documents
  for delete
  to authenticated
  using (public.has_permission(auth.uid(), 'maintenance.manage'));

-- Equipment registration documents (PDF only)

create table if not exists public.equipment_documents (
  id uuid primary key default gen_random_uuid(),
  equipment_id text not null references public.equipment(id) on delete cascade,
  doc_type text not null check (doc_type in ('registration')),
  file_name text not null,
  storage_bucket text not null default 'equipment_docs',
  storage_path text not null,
  uploaded_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_documents_equipment_doc_type_key unique (equipment_id, doc_type)
);

create index if not exists equipment_documents_equipment_created_idx
  on public.equipment_documents (equipment_id, created_at desc);

drop trigger if exists trg_equipment_documents_updated_at on public.equipment_documents;
create trigger trg_equipment_documents_updated_at
before update on public.equipment_documents
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment_docs', 'equipment_docs', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

alter table public.equipment_documents enable row level security;

drop policy if exists equipment_documents_select_view on public.equipment_documents;
create policy equipment_documents_select_view
  on public.equipment_documents
  for select
  to authenticated
  using (public.has_permission(auth.uid(), 'equipment.view'));

drop policy if exists equipment_documents_insert_manage on public.equipment_documents;
create policy equipment_documents_insert_manage
  on public.equipment_documents
  for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'maintenance.manage'));

drop policy if exists equipment_documents_update_manage on public.equipment_documents;
create policy equipment_documents_update_manage
  on public.equipment_documents
  for update
  to authenticated
  using (public.has_permission(auth.uid(), 'maintenance.manage'))
  with check (public.has_permission(auth.uid(), 'maintenance.manage'));

drop policy if exists equipment_documents_delete_manage on public.equipment_documents;
create policy equipment_documents_delete_manage
  on public.equipment_documents
  for delete
  to authenticated
  using (public.has_permission(auth.uid(), 'maintenance.manage'));

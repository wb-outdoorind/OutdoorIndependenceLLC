-- Expand equipment documents to registration + insurance only

alter table public.equipment_documents
  drop constraint if exists equipment_documents_doc_type_check;

alter table public.equipment_documents
  add constraint equipment_documents_doc_type_check
  check (doc_type in ('registration', 'insurance'));

alter table if exists public.accountability_forms
  add column if not exists linked_flag_grade_id bigint
  references public.form_submission_grades(id)
  on delete set null;

create index if not exists accountability_forms_linked_flag_grade_idx
  on public.accountability_forms (linked_flag_grade_id);

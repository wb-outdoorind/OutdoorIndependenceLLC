-- Allow mechanics to upload academy content alongside owner and office admin.
drop policy if exists academy_content_insert_admin on public.academy_content;
create policy academy_content_insert_admin
on public.academy_content
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin','mechanic')
  )
);

-- Configurable notification email templates (starting with teammate invite).

create table if not exists public.app_email_templates (
  template_key text primary key,
  subject_template text not null,
  body_template text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null
);

alter table public.app_email_templates enable row level security;

drop policy if exists app_email_templates_select_manage on public.app_email_templates;
create policy app_email_templates_select_manage
  on public.app_email_templates
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'sales_manager', 'office_admin')
    )
  );

drop policy if exists app_email_templates_insert_manage on public.app_email_templates;
create policy app_email_templates_insert_manage
  on public.app_email_templates
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'sales_manager', 'office_admin')
    )
  );

drop policy if exists app_email_templates_update_manage on public.app_email_templates;
create policy app_email_templates_update_manage
  on public.app_email_templates
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'sales_manager', 'office_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'sales_manager', 'office_admin')
    )
  );

drop policy if exists app_email_templates_delete_manage on public.app_email_templates;
create policy app_email_templates_delete_manage
  on public.app_email_templates
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'operations_manager', 'sales_manager', 'office_admin')
    )
  );

insert into public.app_email_templates (
  template_key,
  subject_template,
  body_template
)
values (
  'teammate_invite',
  'Your Outdoor Independence LLC app login',
  E'Hi {{teammate_name}},\n\n{{invited_by}} created your teammate account.\n\nLogin: {{login_email}}\nTemporary password: {{temporary_password}}\n\nOn first sign-in, you will be prompted to change your password.\n\nOpen the app: {{login_url}}'
)
on conflict (template_key) do nothing;

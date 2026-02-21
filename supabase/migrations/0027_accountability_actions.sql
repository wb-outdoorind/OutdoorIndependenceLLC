create table if not exists public.accountability_actions (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  target_user_id uuid references public.profiles(id) on delete set null,
  role_scope text not null default 'teammate',
  action_type text not null,
  status text not null default 'open',
  note text not null,
  due_date date,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  constraint accountability_actions_role_scope_check
    check (role_scope in ('teammate','mechanic','all')),
  constraint accountability_actions_action_type_check
    check (action_type in ('coaching','warning','critical','recognition')),
  constraint accountability_actions_status_check
    check (status in ('open','resolved','dismissed')),
  constraint accountability_actions_note_not_blank
    check (char_length(trim(note)) > 0)
);

create index if not exists accountability_actions_created_at_idx
  on public.accountability_actions (created_at desc);

create index if not exists accountability_actions_target_user_idx
  on public.accountability_actions (target_user_id, status, created_at desc);

alter table public.accountability_actions enable row level security;

drop policy if exists accountability_actions_select_manager on public.accountability_actions;
create policy accountability_actions_select_manager
  on public.accountability_actions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists accountability_actions_insert_manager on public.accountability_actions;
create policy accountability_actions_insert_manager
  on public.accountability_actions
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists accountability_actions_update_manager on public.accountability_actions;
create policy accountability_actions_update_manager
  on public.accountability_actions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

drop policy if exists accountability_actions_delete_manager on public.accountability_actions;
create policy accountability_actions_delete_manager
  on public.accountability_actions
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner','operations_manager','office_admin','mechanic')
        and p.status = 'Active'
    )
  );

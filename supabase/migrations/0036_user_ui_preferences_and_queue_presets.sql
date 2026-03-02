-- 0036_user_ui_preferences_and_queue_presets.sql
-- Cloud-first user UI state (theme/text size/role preview + accountability queue presets)

create table if not exists public.user_ui_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','light')),
  text_size text not null default 'md' check (text_size in ('sm','md','lg')),
  role_view_override text null check (
    role_view_override in (
      'owner',
      'operations_manager',
      'office_admin',
      'mechanic',
      'team_lead_1',
      'team_lead_2',
      'team_member_1',
      'team_member_2',
      'apprentice',
      'employee'
    )
  ),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_queue_filter_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  filters jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_queue_filter_presets_user_id_idx
  on public.user_queue_filter_presets(user_id);

create unique index if not exists user_queue_filter_presets_user_id_name_idx
  on public.user_queue_filter_presets(user_id, lower(name));

alter table public.user_ui_preferences enable row level security;
alter table public.user_queue_filter_presets enable row level security;

drop policy if exists user_ui_preferences_select_self on public.user_ui_preferences;
create policy user_ui_preferences_select_self
  on public.user_ui_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_ui_preferences_insert_self on public.user_ui_preferences;
create policy user_ui_preferences_insert_self
  on public.user_ui_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_ui_preferences_update_self on public.user_ui_preferences;
create policy user_ui_preferences_update_self
  on public.user_ui_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_queue_filter_presets_select_self on public.user_queue_filter_presets;
create policy user_queue_filter_presets_select_self
  on public.user_queue_filter_presets
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_queue_filter_presets_insert_self on public.user_queue_filter_presets;
create policy user_queue_filter_presets_insert_self
  on public.user_queue_filter_presets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_queue_filter_presets_update_self on public.user_queue_filter_presets;
create policy user_queue_filter_presets_update_self
  on public.user_queue_filter_presets
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_queue_filter_presets_delete_self on public.user_queue_filter_presets;
create policy user_queue_filter_presets_delete_self
  on public.user_queue_filter_presets
  for delete
  to authenticated
  using (auth.uid() = user_id);


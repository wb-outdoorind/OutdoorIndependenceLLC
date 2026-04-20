create table if not exists public.user_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  maintenance_assigned boolean not null default true,
  maintenance_parts_ready boolean not null default true,
  maintenance_overdue boolean not null default true,
  toast_assigned boolean not null default true,
  toast_parts_ready boolean not null default true,
  toast_overdue boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_notification_preferences
  add column if not exists id uuid default gen_random_uuid();
alter table public.user_notification_preferences
  add column if not exists user_id uuid;
alter table public.user_notification_preferences
  add column if not exists maintenance_assigned boolean not null default true;
alter table public.user_notification_preferences
  add column if not exists maintenance_parts_ready boolean not null default true;
alter table public.user_notification_preferences
  add column if not exists maintenance_overdue boolean not null default true;
alter table public.user_notification_preferences
  add column if not exists toast_assigned boolean not null default true;
alter table public.user_notification_preferences
  add column if not exists toast_parts_ready boolean not null default true;
alter table public.user_notification_preferences
  add column if not exists toast_overdue boolean not null default true;
alter table public.user_notification_preferences
  add column if not exists created_at timestamptz not null default now();
alter table public.user_notification_preferences
  add column if not exists updated_at timestamptz not null default now();

update public.user_notification_preferences
set
  maintenance_assigned = coalesce(maintenance_assigned, true),
  maintenance_parts_ready = coalesce(maintenance_parts_ready, true),
  maintenance_overdue = coalesce(maintenance_overdue, true),
  toast_assigned = coalesce(toast_assigned, true),
  toast_parts_ready = coalesce(toast_parts_ready, true),
  toast_overdue = coalesce(toast_overdue, true)
where
  maintenance_assigned is null
  or maintenance_parts_ready is null
  or maintenance_overdue is null
  or toast_assigned is null
  or toast_parts_ready is null
  or toast_overdue is null;

alter table public.user_notification_preferences
  alter column user_id set not null;

create unique index if not exists user_notification_preferences_user_id_idx
  on public.user_notification_preferences (user_id);

alter table public.user_notification_preferences enable row level security;

drop policy if exists user_notification_preferences_select_self on public.user_notification_preferences;
create policy user_notification_preferences_select_self
  on public.user_notification_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_notification_preferences_insert_self on public.user_notification_preferences;
create policy user_notification_preferences_insert_self
  on public.user_notification_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_notification_preferences_update_self on public.user_notification_preferences;
create policy user_notification_preferences_update_self
  on public.user_notification_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trg_user_notification_preferences_updated_at on public.user_notification_preferences;
create trigger trg_user_notification_preferences_updated_at
before update on public.user_notification_preferences
for each row execute function public.set_updated_at();

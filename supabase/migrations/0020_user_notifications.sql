create table if not exists public.user_notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  severity text not null default 'info',
  kind text not null,
  entity_type text null,
  entity_id text null,
  dedupe_key text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  constraint user_notifications_title_not_blank check (char_length(trim(title)) > 0),
  constraint user_notifications_body_not_blank check (char_length(trim(body)) > 0),
  constraint user_notifications_kind_not_blank check (char_length(trim(kind)) > 0),
  constraint user_notifications_dedupe_key_not_blank check (char_length(trim(dedupe_key)) > 0),
  constraint user_notifications_severity_allowed check (severity in ('info', 'warning', 'high', 'critical'))
);

create unique index if not exists user_notifications_dedupe_unique
  on public.user_notifications (recipient_id, dedupe_key);

create index if not exists user_notifications_recipient_read_idx
  on public.user_notifications (recipient_id, is_read, created_at desc);

create index if not exists user_notifications_created_at_idx
  on public.user_notifications (created_at desc);

alter table if exists public.user_notification_prefs enable row level security;
alter table if exists public.user_notifications enable row level security;

drop policy if exists user_notification_prefs_select_self on public.user_notification_prefs;
create policy user_notification_prefs_select_self
  on public.user_notification_prefs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_notification_prefs_insert_self on public.user_notification_prefs;
create policy user_notification_prefs_insert_self
  on public.user_notification_prefs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_notification_prefs_update_self on public.user_notification_prefs;
create policy user_notification_prefs_update_self
  on public.user_notification_prefs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_notifications_select_self on public.user_notifications;
create policy user_notifications_select_self
  on public.user_notifications
  for select
  to authenticated
  using (auth.uid() = recipient_id);

drop policy if exists user_notifications_update_self on public.user_notifications;
create policy user_notifications_update_self
  on public.user_notifications
  for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Inserts are service-side only.

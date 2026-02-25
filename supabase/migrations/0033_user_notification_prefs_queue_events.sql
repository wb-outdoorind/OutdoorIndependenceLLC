alter table if exists public.user_notification_prefs
  add column if not exists queue_events_enabled boolean not null default true;

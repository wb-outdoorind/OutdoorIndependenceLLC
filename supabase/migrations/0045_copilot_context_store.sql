-- Copilot shared context store (per-user event timeline)
-- Used by the in-app Edit bubble to persist route context + prompts + responses
-- across devices/sessions.

create table if not exists public.copilot_context_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('context', 'prompt', 'response')),
  route text,
  page_title text,
  asset_type text,
  asset_id text,
  form_type text,
  prompt text,
  response text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists copilot_context_events_user_created_idx
  on public.copilot_context_events (user_id, created_at desc);

alter table public.copilot_context_events enable row level security;

drop policy if exists copilot_context_events_select_self on public.copilot_context_events;
create policy copilot_context_events_select_self
  on public.copilot_context_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists copilot_context_events_insert_self on public.copilot_context_events;
create policy copilot_context_events_insert_self
  on public.copilot_context_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);


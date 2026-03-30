-- Estimate Drafts (Phase 2 scope persistence)
-- Adds scope builder fields to the existing William-only estimate draft record.

alter table public.estimate_drafts
  add column if not exists package_name text null,
  add column if not exists visit_intent text null check (
    visit_intent is null
    or visit_intent in ('recurring', 'seasonal', 'event_based', 'one_time')
  ),
  add column if not exists scope_summary text null,
  add column if not exists scope_details jsonb not null default '{}'::jsonb,
  add column if not exists operations_notes text null;

create table if not exists public.academy_links_topic (
  content_id uuid not null references public.academy_content(id) on delete cascade,
  topic text not null,
  created_at timestamptz not null default now(),
  constraint academy_links_topic_unique unique (content_id, topic),
  constraint academy_links_topic_topic_not_blank check (char_length(trim(topic)) > 0)
);

create index if not exists academy_links_topic_topic_idx
  on public.academy_links_topic (topic);

alter table public.academy_links_topic enable row level security;

drop policy if exists academy_links_topic_select_authenticated on public.academy_links_topic;
create policy academy_links_topic_select_authenticated
on public.academy_links_topic
for select
to authenticated
using (true);

drop policy if exists academy_links_topic_insert_manage on public.academy_links_topic;
create policy academy_links_topic_insert_manage
on public.academy_links_topic
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'office_admin', 'mechanic')
  )
);

drop policy if exists academy_links_topic_update_manage on public.academy_links_topic;
create policy academy_links_topic_update_manage
on public.academy_links_topic
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'office_admin', 'mechanic')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'office_admin', 'mechanic')
  )
);

drop policy if exists academy_links_topic_delete_manage on public.academy_links_topic;
create policy academy_links_topic_delete_manage
on public.academy_links_topic
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'office_admin', 'mechanic')
  )
);

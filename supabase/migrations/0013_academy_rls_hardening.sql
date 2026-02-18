-- OI Academy: RLS hardening + safety indexes

-- Safety indexes for upserts/seeding
create unique index if not exists academy_content_storage_unique
  on public.academy_content (storage_bucket, storage_path);

create unique index if not exists academy_display_prefs_scope_section_unique
  on public.academy_display_prefs (scope, section);

create unique index if not exists academy_featured_scope_section_content_unique
  on public.academy_featured (scope, section, content_id);

create unique index if not exists academy_links_vehicle_unique
  on public.academy_links_vehicle (content_id, vehicle_id);

create unique index if not exists academy_links_asset_type_unique
  on public.academy_links_asset_type (content_id, asset_type);

create index if not exists academy_views_content_viewed_at_idx
  on public.academy_views (content_id, viewed_at desc);

create index if not exists academy_featured_scope_section_rank_idx
  on public.academy_featured (scope, section, rank);

create index if not exists academy_content_content_type_idx
  on public.academy_content (content_type);

-- Enable RLS
alter table if exists public.academy_content enable row level security;
alter table if exists public.academy_views enable row level security;
alter table if exists public.academy_featured enable row level security;
alter table if exists public.academy_display_prefs enable row level security;
alter table if exists public.academy_links_vehicle enable row level security;
alter table if exists public.academy_links_asset_type enable row level security;

-- academy_content
 drop policy if exists academy_content_select_published on public.academy_content;
create policy academy_content_select_published
on public.academy_content
for select
to authenticated
using (is_published = true);

drop policy if exists academy_content_insert_admin on public.academy_content;
create policy academy_content_insert_admin
on public.academy_content
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

drop policy if exists academy_content_update_admin on public.academy_content;
create policy academy_content_update_admin
on public.academy_content
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

drop policy if exists academy_content_delete_admin on public.academy_content;
create policy academy_content_delete_admin
on public.academy_content
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

-- academy_views
 drop policy if exists academy_views_insert_authenticated_self on public.academy_views;
create policy academy_views_insert_authenticated_self
on public.academy_views
for insert
to authenticated
with check (viewer_id = auth.uid());

drop policy if exists academy_views_select_admin on public.academy_views;
create policy academy_views_select_admin
on public.academy_views
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

-- academy_featured
 drop policy if exists academy_featured_select_authenticated on public.academy_featured;
create policy academy_featured_select_authenticated
on public.academy_featured
for select
to authenticated
using (true);

drop policy if exists academy_featured_insert_admin on public.academy_featured;
create policy academy_featured_insert_admin
on public.academy_featured
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

drop policy if exists academy_featured_update_admin on public.academy_featured;
create policy academy_featured_update_admin
on public.academy_featured
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

drop policy if exists academy_featured_delete_admin on public.academy_featured;
create policy academy_featured_delete_admin
on public.academy_featured
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

-- academy_display_prefs
 drop policy if exists academy_display_prefs_select_authenticated on public.academy_display_prefs;
create policy academy_display_prefs_select_authenticated
on public.academy_display_prefs
for select
to authenticated
using (true);

drop policy if exists academy_display_prefs_insert_admin on public.academy_display_prefs;
create policy academy_display_prefs_insert_admin
on public.academy_display_prefs
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

drop policy if exists academy_display_prefs_update_admin on public.academy_display_prefs;
create policy academy_display_prefs_update_admin
on public.academy_display_prefs
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

-- academy_links_vehicle
 drop policy if exists academy_links_vehicle_select_authenticated on public.academy_links_vehicle;
create policy academy_links_vehicle_select_authenticated
on public.academy_links_vehicle
for select
to authenticated
using (true);

drop policy if exists academy_links_vehicle_insert_admin on public.academy_links_vehicle;
create policy academy_links_vehicle_insert_admin
on public.academy_links_vehicle
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

drop policy if exists academy_links_vehicle_update_admin on public.academy_links_vehicle;
create policy academy_links_vehicle_update_admin
on public.academy_links_vehicle
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

drop policy if exists academy_links_vehicle_delete_admin on public.academy_links_vehicle;
create policy academy_links_vehicle_delete_admin
on public.academy_links_vehicle
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

-- academy_links_asset_type
 drop policy if exists academy_links_asset_type_select_authenticated on public.academy_links_asset_type;
create policy academy_links_asset_type_select_authenticated
on public.academy_links_asset_type
for select
to authenticated
using (true);

drop policy if exists academy_links_asset_type_insert_admin on public.academy_links_asset_type;
create policy academy_links_asset_type_insert_admin
on public.academy_links_asset_type
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

drop policy if exists academy_links_asset_type_update_admin on public.academy_links_asset_type;
create policy academy_links_asset_type_update_admin
on public.academy_links_asset_type
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

drop policy if exists academy_links_asset_type_delete_admin on public.academy_links_asset_type;
create policy academy_links_asset_type_delete_admin
on public.academy_links_asset_type
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin')
  )
);

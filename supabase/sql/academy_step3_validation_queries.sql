-- Step 3 validation queries
-- Replace :vehicle_id and :asset_type in your SQL client as needed.

-- 1) Top 4 most viewed SOP PDFs for a vehicle (lookback from prefs, default 30)
with prefs as (
  select coalesce(dp.lookback_days, 30) as lookback_days
  from public.academy_display_prefs dp
  where dp.scope = 'vehicle:' || :vehicle_id
    and dp.section = 'sop_pdfs'
  limit 1
),
linked as (
  select lv.content_id
  from public.academy_links_vehicle lv
  where lv.vehicle_id = :vehicle_id
),
counts as (
  select av.content_id, count(*)::int as view_count
  from public.academy_views av
  join linked l on l.content_id = av.content_id
  where av.viewed_at >= now() - make_interval(days => coalesce((select lookback_days from prefs), 30))
  group by av.content_id
)
select c.id, c.title, c.description, c.content_type, c.storage_bucket, c.storage_path, coalesce(ct.view_count, 0) as views
from public.academy_content c
join linked l on l.content_id = c.id
left join counts ct on ct.content_id = c.id
where c.is_published = true
  and c.content_type = 'pdf'
order by coalesce(ct.view_count, 0) desc, c.title asc
limit 4;

-- 2) Fallback to asset_type if vehicle has no linked rows
with vehicle_link_count as (
  select count(*)::int as cnt
  from public.academy_links_vehicle
  where vehicle_id = :vehicle_id
),
prefs as (
  select coalesce(dp.lookback_days, 30) as lookback_days
  from public.academy_display_prefs dp
  where dp.scope = case
      when (select cnt from vehicle_link_count) > 0 then 'vehicle:' || :vehicle_id
      else 'asset_type:' || lower(:asset_type)
    end
    and dp.section = 'sop_pdfs'
  limit 1
),
linked as (
  select lv.content_id
  from public.academy_links_vehicle lv
  where lv.vehicle_id = :vehicle_id
    and (select cnt from vehicle_link_count) > 0
  union all
  select la.content_id
  from public.academy_links_asset_type la
  where la.asset_type = :asset_type
    and (select cnt from vehicle_link_count) = 0
),
counts as (
  select av.content_id, count(*)::int as view_count
  from public.academy_views av
  join linked l on l.content_id = av.content_id
  where av.viewed_at >= now() - make_interval(days => coalesce((select lookback_days from prefs), 30))
  group by av.content_id
)
select c.id, c.title, c.description, c.content_type, c.storage_bucket, c.storage_path, coalesce(ct.view_count, 0) as views
from public.academy_content c
join linked l on l.content_id = c.id
left join counts ct on ct.content_id = c.id
where c.is_published = true
  and c.content_type = 'pdf'
order by coalesce(ct.view_count, 0) desc, c.title asc
limit 4;

-- 3) Preset mode query (rank asc) with vehicle-first scope fallback
with vehicle_featured_count as (
  select count(*)::int as cnt
  from public.academy_featured f
  where f.scope = 'vehicle:' || :vehicle_id
    and f.section = :section
    and coalesce(f.is_active, true) = true
),
selected_scope as (
  select case
      when (select cnt from vehicle_featured_count) > 0 then 'vehicle:' || :vehicle_id
      else 'asset_type:' || lower(:asset_type)
    end as scope
)
select c.id, c.title, c.description, c.content_type, c.storage_bucket, c.storage_path, f.rank
from public.academy_featured f
join selected_scope ss on ss.scope = f.scope
join public.academy_content c on c.id = f.content_id
where f.section = :section
  and coalesce(f.is_active, true) = true
  and c.is_published = true
order by f.rank asc
limit 4;

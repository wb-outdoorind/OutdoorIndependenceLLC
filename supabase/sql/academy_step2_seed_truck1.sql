-- Step 2 seed for OI Academy
-- Uses provided values:
-- admin UUID: 8412af42-22c8-4fc2-9c00-4ea0dd733fdc
-- vehicle id: Truck_1

begin;

do $$
begin
  if not exists (
    select 1 from public.profiles where id = '8412af42-22c8-4fc2-9c00-4ea0dd733fdc'::uuid
  ) then
    raise exception 'Profile not found for admin UUID';
  end if;

  if not exists (
    select 1 from public.vehicles where id = 'Truck_1'
  ) then
    raise exception 'Vehicle Truck_1 not found';
  end if;
end
$$;

with seed_content as (
  select 'sop_1'::text as seed_key, 'SOP: Daily Vehicle Walkaround'::text as title, 'Daily pre-use SOP checklist'::text as description, 'pdf'::text as content_type, 'academy_pdfs'::text as storage_bucket, 'sops/daily-vehicle-walkaround.pdf'::text as storage_path
  union all select 'sop_2','SOP: Fueling and Spill Response','Fueling safety and spill containment','pdf','academy_pdfs','sops/fueling-spill-response.pdf'
  union all select 'sop_3','SOP: Trailer Hitching','Safe trailer hitching sequence','pdf','academy_pdfs','sops/trailer-hitching.pdf'
  union all select 'sop_4','SOP: End of Day Shutdown','Shutdown and lockout steps','pdf','academy_pdfs','sops/end-of-day-shutdown.pdf'
  union all select 'vid_1','Training: Pre-Trip Essentials','Pre-trip inspection training','video','academy_videos','videos/pretrip-essentials.mp4'
  union all select 'vid_2','Training: Backing and Spotting','Safe backing and spotting techniques','video','academy_videos','videos/backing-and-spotting.mp4'
  union all select 'vid_3','Training: Liftgate Safety','Liftgate operation safety','video','academy_videos','videos/liftgate-safety.mp4'
  union all select 'vid_4','Training: Incident Reporting','How to report incidents correctly','video','academy_videos','videos/incident-reporting.mp4'
),
upserted_content as (
  insert into public.academy_content (
    title,
    description,
    content_type,
    storage_bucket,
    storage_path,
    is_published,
    published_at,
    created_by
  )
  select
    sc.title,
    sc.description,
    sc.content_type,
    sc.storage_bucket,
    sc.storage_path,
    true,
    now(),
    '8412af42-22c8-4fc2-9c00-4ea0dd733fdc'::uuid
  from seed_content sc
  on conflict (storage_bucket, storage_path) do update
  set
    title = excluded.title,
    description = excluded.description,
    content_type = excluded.content_type,
    is_published = true,
    published_at = coalesce(public.academy_content.published_at, now())
  returning id, storage_bucket, storage_path
),
resolved as (
  select
    sc.seed_key,
    ac.id as content_id
  from seed_content sc
  join public.academy_content ac
    on ac.storage_bucket = sc.storage_bucket
   and ac.storage_path = sc.storage_path
),
vehicle_links as (
  insert into public.academy_links_vehicle (content_id, vehicle_id)
  select content_id, 'Truck_1'
  from resolved
  where seed_key in ('sop_1', 'sop_2', 'vid_1', 'vid_2')
  on conflict do nothing
  returning content_id
),
asset_links as (
  insert into public.academy_links_asset_type (content_id, asset_type)
  select content_id, 'Truck'
  from resolved
  where seed_key in ('sop_3', 'sop_4', 'vid_3', 'vid_4')
  on conflict do nothing
  returning content_id
),
upsert_prefs as (
  insert into public.academy_display_prefs (scope, section, mode, lookback_days, max_items, updated_by)
  values
    ('vehicle:Truck_1', 'sop_pdfs', 'preset', 30, 4, '8412af42-22c8-4fc2-9c00-4ea0dd733fdc'::uuid),
    ('vehicle:Truck_1', 'training_videos', 'preset', 30, 4, '8412af42-22c8-4fc2-9c00-4ea0dd733fdc'::uuid)
  on conflict (scope, section) do update
  set
    mode = excluded.mode,
    lookback_days = excluded.lookback_days,
    max_items = excluded.max_items,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning scope, section
),
clear_featured as (
  delete from public.academy_featured
  where scope = 'vehicle:Truck_1'
    and section in ('sop_pdfs', 'training_videos')
  returning id
)
insert into public.academy_featured (scope, section, content_id, rank, is_active, created_by)
select
  'vehicle:Truck_1',
  'sop_pdfs',
  r.content_id,
  case r.seed_key when 'sop_1' then 1 when 'sop_2' then 2 when 'sop_3' then 3 when 'sop_4' then 4 end,
  true,
  '8412af42-22c8-4fc2-9c00-4ea0dd733fdc'::uuid
from resolved r
where r.seed_key in ('sop_1', 'sop_2', 'sop_3', 'sop_4')
union all
select
  'vehicle:Truck_1',
  'training_videos',
  r.content_id,
  case r.seed_key when 'vid_1' then 1 when 'vid_2' then 2 when 'vid_3' then 3 when 'vid_4' then 4 end,
  true,
  '8412af42-22c8-4fc2-9c00-4ea0dd733fdc'::uuid
from resolved r
where r.seed_key in ('vid_1', 'vid_2', 'vid_3', 'vid_4');

commit;

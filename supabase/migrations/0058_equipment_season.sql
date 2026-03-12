alter table if exists public.equipment
  add column if not exists season text;

update public.equipment
set season = case
  when lower(
    coalesce(equipment_type, '') || ' ' || coalesce(name, '') || ' ' || coalesce(id, '')
  ) like any (array['%truck%', '%trailer%', '%trlr%', '%loader%', '%skid%']) then 'All'
  when lower(
    coalesce(equipment_type, '') || ' ' || coalesce(name, '') || ' ' || coalesce(id, '')
  ) like any (array['%snow%', '%plow%', '%salter%', '%salt%', '%deicer%', '%de-icer%', '%sander%']) then 'Winter'
  else 'Summer'
end
where season is null or btrim(season) = '';

update public.equipment
set season = case lower(btrim(season))
  when 'all' then 'All'
  when 'summer' then 'Summer'
  when 'winter' then 'Winter'
  else 'Summer'
end
where season is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_season_check'
      and conrelid = 'public.equipment'::regclass
  ) then
    alter table public.equipment
      add constraint equipment_season_check
      check (season in ('All', 'Summer', 'Winter'));
  end if;
end $$;

alter table if exists public.equipment
  alter column season set default 'Summer';

alter table if exists public.equipment
  alter column season set not null;

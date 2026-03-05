-- 0043_profile_name_parts.sql
-- Add structured name fields for teammate profiles:
-- first_name, middle_initial, last_name, nickname.
-- Backfill from existing full_name and keep full_name in sync.

alter table if exists public.profiles
  add column if not exists first_name text null,
  add column if not exists middle_initial text null,
  add column if not exists last_name text null,
  add column if not exists nickname text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_middle_initial_len_chk'
  ) then
    alter table public.profiles
      add constraint profiles_middle_initial_len_chk
      check (middle_initial is null or char_length(trim(middle_initial)) <= 1);
  end if;
end
$$;

with normalized as (
  select
    id,
    nullif(trim(regexp_replace(coalesce(full_name, ''), '\s+', ' ', 'g')), '') as full_name_norm
  from public.profiles
),
parts as (
  select
    id,
    regexp_split_to_array(full_name_norm, ' ') as tokens
  from normalized
),
computed as (
  select
    id,
    nullif(trim(coalesce(tokens[1], '')), '') as parsed_first_name,
    nullif(upper(left(trim(coalesce(tokens[2], '')), 1)), '') as parsed_middle_initial,
    nullif(trim(coalesce(tokens[array_length(tokens, 1)], '')), '') as parsed_last_name
  from parts
)
update public.profiles p
set
  first_name = coalesce(nullif(trim(p.first_name), ''), c.parsed_first_name),
  middle_initial = coalesce(
    nullif(upper(left(trim(coalesce(p.middle_initial, '')), 1)), ''),
    c.parsed_middle_initial
  ),
  last_name = coalesce(nullif(trim(p.last_name), ''), c.parsed_last_name),
  nickname = coalesce(
    nullif(trim(p.nickname), ''),
    coalesce(nullif(trim(p.first_name), ''), c.parsed_first_name)
  ),
  full_name = coalesce(
    nullif(trim(p.full_name), ''),
    nullif(
      trim(
        concat_ws(
          ' ',
          coalesce(nullif(trim(p.first_name), ''), c.parsed_first_name),
          coalesce(nullif(upper(left(trim(coalesce(p.middle_initial, '')), 1)), ''), c.parsed_middle_initial),
          coalesce(nullif(trim(p.last_name), ''), c.parsed_last_name)
        )
      ),
      ''
    )
  )
from computed c
where p.id = c.id;

create or replace function public.sync_profile_name_parts()
returns trigger
language plpgsql
as $$
declare
  normalized_full_name text;
  name_parts text[];
  parsed_first_name text;
  parsed_middle_initial text;
  parsed_last_name text;
begin
  new.first_name := nullif(trim(coalesce(new.first_name, '')), '');
  new.middle_initial := nullif(upper(left(trim(coalesce(new.middle_initial, '')), 1)), '');
  new.last_name := nullif(trim(coalesce(new.last_name, '')), '');
  new.nickname := nullif(trim(coalesce(new.nickname, '')), '');
  normalized_full_name := nullif(trim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g')), '');

  if (new.first_name is null or new.last_name is null) and normalized_full_name is not null then
    name_parts := regexp_split_to_array(normalized_full_name, ' ');
    parsed_first_name := nullif(trim(coalesce(name_parts[1], '')), '');
    parsed_middle_initial := nullif(upper(left(trim(coalesce(name_parts[2], '')), 1)), '');
    parsed_last_name := nullif(trim(coalesce(name_parts[array_length(name_parts, 1)], '')), '');

    if new.first_name is null then
      new.first_name := parsed_first_name;
    end if;
    if new.middle_initial is null then
      new.middle_initial := parsed_middle_initial;
    end if;
    if new.last_name is null then
      new.last_name := parsed_last_name;
    end if;
  end if;

  if new.nickname is null then
    new.nickname := new.first_name;
  end if;

  if new.first_name is not null or new.last_name is not null then
    new.full_name := nullif(trim(concat_ws(' ', new.first_name, new.middle_initial, new.last_name)), '');
  else
    new.full_name := normalized_full_name;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_name_parts_tg on public.profiles;
create trigger profiles_sync_name_parts_tg
before insert or update of full_name, first_name, middle_initial, last_name, nickname
on public.profiles
for each row
execute function public.sync_profile_name_parts();

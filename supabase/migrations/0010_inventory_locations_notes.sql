-- 0010_inventory_locations_notes.sql
alter table public.inventory_locations
add column if not exists notes text;


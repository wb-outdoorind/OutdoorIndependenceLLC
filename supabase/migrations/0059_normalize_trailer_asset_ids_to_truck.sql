-- Keep trailer/truck all-season IDs in a single Truck_# style.
-- Converts legacy Trailer_# values to Truck_#.

update public.vehicles
set asset = regexp_replace(asset, '^Trailer_', 'Truck_')
where asset ~ '^Trailer_[0-9]+$';

update public.equipment
set external_id = regexp_replace(external_id, '^Trailer_', 'Truck_')
where external_id ~ '^Trailer_[0-9]+$';

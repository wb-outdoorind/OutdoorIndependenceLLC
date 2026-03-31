-- Ensure form-entered mileage/hours reliably push forward to asset detail readings.
-- Uses SECURITY DEFINER RPCs so form submitters do not depend on direct table update RLS.

create or replace function public.sync_vehicle_mileage_forward(
  p_vehicle_id text,
  p_mileage numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_mileage numeric;
begin
  if p_vehicle_id is null or btrim(p_vehicle_id) = '' then
    raise exception 'Vehicle ID is required.';
  end if;

  if p_mileage is null or p_mileage < 0 then
    raise exception 'Mileage must be zero or greater.';
  end if;

  update public.vehicles v
  set mileage = greatest(coalesce(v.mileage, 0)::numeric, p_mileage)
  where v.id = p_vehicle_id
  returning v.mileage::numeric into v_next_mileage;

  if v_next_mileage is null then
    raise exception 'Vehicle not found.';
  end if;

  return v_next_mileage;
end;
$$;

revoke all on function public.sync_vehicle_mileage_forward(text, numeric) from public;
grant execute on function public.sync_vehicle_mileage_forward(text, numeric) to authenticated;
grant execute on function public.sync_vehicle_mileage_forward(text, numeric) to service_role;

create or replace function public.sync_equipment_hours_forward(
  p_equipment_id text,
  p_hours numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_hours numeric;
begin
  if p_equipment_id is null or btrim(p_equipment_id) = '' then
    raise exception 'Equipment ID is required.';
  end if;

  if p_hours is null or p_hours < 0 then
    raise exception 'Hours must be zero or greater.';
  end if;

  update public.equipment e
  set current_hours = greatest(coalesce(e.current_hours, 0)::numeric, p_hours)
  where e.id = p_equipment_id
  returning e.current_hours::numeric into v_next_hours;

  if v_next_hours is null then
    raise exception 'Equipment not found.';
  end if;

  return v_next_hours;
end;
$$;

revoke all on function public.sync_equipment_hours_forward(text, numeric) from public;
grant execute on function public.sync_equipment_hours_forward(text, numeric) to authenticated;
grant execute on function public.sync_equipment_hours_forward(text, numeric) to service_role;

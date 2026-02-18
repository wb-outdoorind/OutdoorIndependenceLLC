-- Allow mechanics to create academy link rows during upload workflows.

drop policy if exists academy_links_vehicle_insert_admin on public.academy_links_vehicle;
create policy academy_links_vehicle_insert_admin
on public.academy_links_vehicle
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin','mechanic')
  )
);

drop policy if exists academy_links_asset_type_insert_admin on public.academy_links_asset_type;
create policy academy_links_asset_type_insert_admin
on public.academy_links_asset_type
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner','office_admin','mechanic')
  )
);

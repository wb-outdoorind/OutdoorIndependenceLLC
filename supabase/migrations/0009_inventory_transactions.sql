-- 0009_inventory_transactions.sql
-- Inventory transaction ledger (usage / adjustment / transfer)

create extension if not exists pgcrypto;

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  item_id text not null references public.inventory_items(id) on delete cascade,
  from_location_id uuid null references public.inventory_locations(id) on delete set null,
  to_location_id uuid null references public.inventory_locations(id) on delete set null,
  change_qty integer not null,
  reason text,
  reference_type text,
  reference_id text,
  notes text,

  created_by uuid not null default auth.uid()
);

create index if not exists inventory_transactions_item_id_idx
  on public.inventory_transactions (item_id);

create index if not exists inventory_transactions_created_at_idx
  on public.inventory_transactions (created_at desc);

create index if not exists inventory_transactions_from_location_id_idx
  on public.inventory_transactions (from_location_id);

create index if not exists inventory_transactions_to_location_id_idx
  on public.inventory_transactions (to_location_id);

create or replace function public.apply_inventory_transaction()
returns trigger
language plpgsql
as $$
declare
  current_qty integer;
  next_qty integer;
begin
  select i.quantity into current_qty
  from public.inventory_items i
  where i.id = new.item_id
  for update;

  if current_qty is null then
    raise exception 'Inventory item not found for transaction: %', new.item_id;
  end if;

  next_qty := current_qty + new.change_qty;

  if next_qty < 0 then
    raise exception 'Inventory quantity cannot go below 0 for item % (current %, change %)',
      new.item_id,
      current_qty,
      new.change_qty;
  end if;

  update public.inventory_items
  set
    quantity = next_qty,
    location_id = case
      when new.to_location_id is not null then new.to_location_id
      else location_id
    end,
    updated_at = now()
  where id = new.item_id;

  return new;
end;
$$;

drop trigger if exists apply_inventory_transaction_insert on public.inventory_transactions;
create trigger apply_inventory_transaction_insert
after insert on public.inventory_transactions
for each row
execute function public.apply_inventory_transaction();

alter table public.inventory_transactions enable row level security;

drop policy if exists inventory_transactions_select_authenticated on public.inventory_transactions;
create policy inventory_transactions_select_authenticated
  on public.inventory_transactions
  for select
  to authenticated
  using (true);

-- INSERT limited to owner, office_admin, mechanic roles.
-- Requires public.profiles with role text keyed by auth user id.
drop policy if exists inventory_transactions_insert_role_based on public.inventory_transactions;
create policy inventory_transactions_insert_role_based
  on public.inventory_transactions
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

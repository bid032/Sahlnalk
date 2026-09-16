-- 05_freeze_cost_price.sql
-- Freezes cost price on each order_item so historical profit/cost calculations
-- are not affected when admins later change plan_costs.
-- Also relaxes the frozen_unit_price update trigger for admin corrections.
--
-- Prerequisite: migration/04_add_frozen_unit_price.sql must be applied first.

begin;

-- 1) Add frozen_cost_price column (nullable at first so we can backfill).
alter table public.order_items
  add column if not exists frozen_cost_price numeric(10,2);

-- 2) Backfill from current plan_costs for any existing rows.
update public.order_items oi
   set frozen_cost_price = coalesce(pc.cost_price, 0)
  from public.plan_costs pc
 where oi.plan_id = pc.plan_id
   and oi.frozen_cost_price is null;

-- Any remaining rows (no matching plan_cost) → 0
update public.order_items
   set frozen_cost_price = 0
 where frozen_cost_price is null;

alter table public.order_items
  alter column frozen_cost_price set not null,
  alter column frozen_cost_price set default 0;

-- 3) Trigger: on INSERT, always copy the live plan_costs.cost_price into
--    frozen_cost_price so callers don't need to look it up client-side.
create or replace function public.tg_set_frozen_cost_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  live_cost numeric(10,2);
begin
  if new.plan_id is null then
    new.frozen_cost_price := coalesce(new.frozen_cost_price, 0);
    return new;
  end if;
  select cost_price into live_cost from public.plan_costs where plan_id = new.plan_id;
  new.frozen_cost_price := coalesce(live_cost, 0);
  return new;
end;
$$;

drop trigger if exists trg_set_frozen_cost_price on public.order_items;
create trigger trg_set_frozen_cost_price
  before insert on public.order_items
  for each row
  execute function public.tg_set_frozen_cost_price();

-- 4) Prevent frozen_cost_price from being changed after insert.
create or replace function public.tg_prevent_frozen_cost_change()
returns trigger
language plpgsql
as $$
begin
  if new.frozen_cost_price is distinct from old.frozen_cost_price then
    raise exception 'Cannot change frozen_cost_price after order creation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_frozen_cost_change on public.order_items;
create trigger trg_prevent_frozen_cost_change
  before update of frozen_cost_price on public.order_items
  for each row
  execute function public.tg_prevent_frozen_cost_change();

commit;

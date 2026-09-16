-- إضافة عمود frozen_unit_price لجدول order_items
-- ده العمود هيخزن السعر الفعلي وقت إنشاء الطلب عشان ما يتأثرش بالتغيرات المستقبلية في الأسعار

begin;

-- إضافة العمود مع القيمة الافتراضية هي unit_price الحالي
alter table public.order_items
add column if not exists frozen_unit_price numeric(10,2);

-- تحديث كل الطلبات الحالية عشان frozen_unit_price = unit_price
update public.order_items
set frozen_unit_price = unit_price
where frozen_unit_price is null;

-- إضافة قيد لمنع القيمة الفارغة
alter table public.order_items
alter column frozen_unit_price set not null;

-- إضافة تريجر عشان يخزن السعر الفعلي وقت إنشاء الطلب
create or replace function public.tg_set_frozen_unit_price()
returns trigger as $$
begin
  new.frozen_unit_price := new.unit_price;
  return new;
end;
$$ language plpgsql;

-- إضافة التريجر على insert
create trigger trg_set_frozen_unit_price
before insert on public.order_items
for each row
execute function public.tg_set_frozen_unit_price();

-- إضافة التريجر على update (عشان ما يتغيرش السعر بعد الإنشاء)
create or replace function public.tg_prevent_frozen_unit_price_change()
returns trigger as $$
begin
  if new.frozen_unit_price is distinct from old.frozen_unit_price then
    raise exception 'Cannot change frozen_unit_price after order creation';
  end if;
  return new;
end;
$$ language plpgsql;

-- إضافة التريجر على update
create trigger trg_prevent_frozen_unit_price_change
before update of frozen_unit_price on public.order_items
for each row
execute function public.tg_prevent_frozen_unit_price_change();

commit;
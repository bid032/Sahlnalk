-- إضافة الحقول المطلوبة لعرض تفاصيل الخطة الكاملة في مخزون التسليم الفوري
ALTER TABLE public.account_inventory
  ADD COLUMN IF NOT EXISTS plan_name_ar text,
  ADD COLUMN IF NOT EXISTS plan_name_en text,
  ADD COLUMN IF NOT EXISTS plan_duration_days integer,
  ADD COLUMN IF NOT EXISTS plan_type text,
  ADD COLUMN IF NOT EXISTS account_type text;

-- تحديث البيانات الحالية لملء الحقول الجديدة من جدول product_plans
UPDATE public.account_inventory ai
SET
  plan_name_ar = pp.name_ar,
  plan_name_en = pp.name_en,
  plan_duration_days = pp.duration_days,
  plan_type = pp.type,
  account_type = pp.account_type
FROM public.product_plans pp
WHERE ai.plan_id = pp.id;

-- إضافة مشغل لتحديث الحقول الجديدة عند إضافة أو تحديث سجلات المخزون
CREATE OR REPLACE FUNCTION public.update_inventory_plan_details()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (NEW.plan_id IS DISTINCT FROM OLD.plan_id)) THEN
    SELECT
      name_ar, name_en, duration_days, type, account_type
    INTO
      NEW.plan_name_ar, NEW.plan_name_en, NEW.plan_duration_days, NEW.plan_type, NEW.account_type
    FROM public.product_plans
    WHERE id = NEW.plan_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_inventory_plan_details ON public.account_inventory;
CREATE TRIGGER update_inventory_plan_details
BEFORE INSERT OR UPDATE ON public.account_inventory
FOR EACH ROW EXECUTE FUNCTION public.update_inventory_plan_details();

-- تحديث المشغل الموجود لتحديث المخزون ليشمل الحقول الجديدة
CREATE OR REPLACE FUNCTION public.tg_account_inventory_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_plan_stock_from_inventory(OLD.plan_id);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.sync_plan_stock_from_inventory(NEW.plan_id);
    RETURN NEW;
  ELSE
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      PERFORM public.sync_plan_stock_from_inventory(OLD.plan_id);
    END IF;
    PERFORM public.sync_plan_stock_from_inventory(NEW.plan_id);
    RETURN NEW;
  END IF;
END;
$$;
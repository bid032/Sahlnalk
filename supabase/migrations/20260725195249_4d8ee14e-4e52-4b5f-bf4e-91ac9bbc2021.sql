-- Freeze order_items unit_price at insert time so historical revenue/profit isn't affected by future plan price changes.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS frozen_unit_price numeric(10,2);

-- Backfill existing rows with their current unit_price
UPDATE public.order_items
SET frozen_unit_price = unit_price
WHERE frozen_unit_price IS NULL;

ALTER TABLE public.order_items
  ALTER COLUMN frozen_unit_price SET NOT NULL;

-- Trigger: on INSERT, copy unit_price -> frozen_unit_price (source of truth for historical price)
CREATE OR REPLACE FUNCTION public.tg_set_frozen_unit_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.frozen_unit_price IS NULL THEN
    NEW.frozen_unit_price := NEW.unit_price;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_frozen_unit_price ON public.order_items;
CREATE TRIGGER trg_set_frozen_unit_price
BEFORE INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_frozen_unit_price();

-- Trigger: prevent changes to frozen_unit_price after creation (staff can adjust unit_price only via refunds flow)
CREATE OR REPLACE FUNCTION public.tg_prevent_frozen_unit_price_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.frozen_unit_price IS DISTINCT FROM OLD.frozen_unit_price THEN
    RAISE EXCEPTION 'frozen_unit_price is immutable after order creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_frozen_unit_price_change ON public.order_items;
CREATE TRIGGER trg_prevent_frozen_unit_price_change
BEFORE UPDATE OF frozen_unit_price ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_prevent_frozen_unit_price_change();

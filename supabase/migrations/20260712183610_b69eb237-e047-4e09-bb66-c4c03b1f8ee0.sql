
-- 1. Update claim_inventory_for_item to also refresh product_plans.stock
CREATE OR REPLACE FUNCTION public.claim_inventory_for_item(_order_item_id uuid, _plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claimed_id uuid;
  claimed record;
  remaining int;
BEGIN
  SELECT id INTO claimed_id
  FROM public.account_inventory
  WHERE plan_id = _plan_id AND status = 'available'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.account_inventory
  SET status = 'delivered',
      delivered_order_item_id = _order_item_id,
      delivered_at = now()
  WHERE id = claimed_id
  RETURNING account_email, account_username, account_password, extra_notes INTO claimed;

  INSERT INTO public.delivered_accounts (order_item_id, account_email, account_username, account_password, extra_notes)
  VALUES (_order_item_id, claimed.account_email, claimed.account_username, claimed.account_password, claimed.extra_notes);

  -- Sync product_plans.stock to remaining available inventory count
  SELECT COUNT(*) INTO remaining
  FROM public.account_inventory
  WHERE plan_id = _plan_id AND status = 'available';

  UPDATE public.product_plans SET stock = remaining WHERE id = _plan_id;

  RETURN claimed_id;
END;
$function$;

-- 2. Trigger to decrement stock for manual (non-inventory-backed) order items
CREATE OR REPLACE FUNCTION public.decrement_plan_stock_on_order_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  has_inventory boolean;
BEGIN
  IF NEW.plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If plan has inventory rows, stock is managed by claim_inventory_for_item
  SELECT EXISTS(
    SELECT 1 FROM public.account_inventory WHERE plan_id = NEW.plan_id
  ) INTO has_inventory;

  IF has_inventory THEN
    RETURN NEW;
  END IF;

  UPDATE public.product_plans
  SET stock = GREATEST(0, COALESCE(stock, 0) - COALESCE(NEW.quantity, 1))
  WHERE id = NEW.plan_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_decrement_plan_stock ON public.order_items;
CREATE TRIGGER trg_decrement_plan_stock
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.decrement_plan_stock_on_order_item();

-- 3. Backfill: sync stock for all inventory-backed plans to actual available count
UPDATE public.product_plans pp
SET stock = sub.cnt
FROM (
  SELECT plan_id, COUNT(*) FILTER (WHERE status = 'available') AS cnt
  FROM public.account_inventory
  GROUP BY plan_id
) sub
WHERE pp.id = sub.plan_id;

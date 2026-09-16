
-- 1) Include 'refunded' in the revenue base so historical revenue stays stable.
--    Profit still nets out real refund amounts.
CREATE OR REPLACE FUNCTION public.admin_revenue_stats(_start timestamptz DEFAULT NULL, _end timestamptz DEFAULT NULL)
RETURNS TABLE(revenue numeric, profit numeric, orders_count bigint, items_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  refund_total numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(SUM(r.amount), 0) INTO refund_total
  FROM public.refunds r
  JOIN public.orders o ON o.id = r.order_id
  WHERE o.status IN ('paid','delivered','refunded')
    AND (_start IS NULL OR o.created_at >= _start)
    AND (_end   IS NULL OR o.created_at <  _end);

  RETURN QUERY
  SELECT
    COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric,
    (COALESCE(SUM((oi.unit_price - COALESCE(pc.cost_price, 0)) * oi.quantity), 0) - refund_total)::numeric,
    COUNT(DISTINCT o.id),
    COALESCE(SUM(oi.quantity), 0)::bigint
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  LEFT JOIN public.plan_costs pc ON pc.plan_id = oi.plan_id
  WHERE o.status IN ('paid','delivered','refunded')
    AND (_start IS NULL OR o.created_at >= _start)
    AND (_end   IS NULL OR o.created_at <  _end);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_revenue_by_month()
RETURNS TABLE(month date, revenue numeric, profit numeric, orders_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH sales AS (
    SELECT
      date_trunc('month', o.created_at)::date AS m,
      SUM(oi.unit_price * oi.quantity)::numeric AS rev,
      SUM((oi.unit_price - COALESCE(pc.cost_price, 0)) * oi.quantity)::numeric AS gprof,
      COUNT(DISTINCT o.id) AS oc
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.plan_costs pc ON pc.plan_id = oi.plan_id
    WHERE o.status IN ('paid','delivered','refunded')
    GROUP BY 1
  ),
  refs AS (
    SELECT date_trunc('month', o.created_at)::date AS m,
           SUM(r.amount)::numeric AS ref
    FROM public.refunds r
    JOIN public.orders o ON o.id = r.order_id
    WHERE o.status IN ('paid','delivered','refunded')
    GROUP BY 1
  )
  SELECT s.m,
         COALESCE(s.rev, 0),
         (COALESCE(s.gprof, 0) - COALESCE(refs.ref, 0)),
         COALESCE(s.oc, 0)
  FROM sales s
  LEFT JOIN refs ON refs.m = s.m
  ORDER BY s.m DESC;
END;
$function$;

-- 2) Auto-sync product_plans.stock from account_inventory so badges are accurate.
CREATE OR REPLACE FUNCTION public.sync_plan_stock_from_inventory(_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cnt int;
BEGIN
  IF _plan_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_inventory WHERE plan_id = _plan_id) THEN
    -- No inventory rows for this plan (manual delivery). Leave stock alone.
    RETURN;
  END IF;
  SELECT COUNT(*) INTO cnt
  FROM public.account_inventory
  WHERE plan_id = _plan_id AND status = 'available';
  UPDATE public.product_plans SET stock = cnt WHERE id = _plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_account_inventory_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

DROP TRIGGER IF EXISTS account_inventory_sync_stock ON public.account_inventory;
CREATE TRIGGER account_inventory_sync_stock
AFTER INSERT OR UPDATE OR DELETE ON public.account_inventory
FOR EACH ROW EXECUTE FUNCTION public.tg_account_inventory_sync();

-- Backfill: reconcile every plan that has inventory rows.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT plan_id FROM public.account_inventory WHERE plan_id IS NOT NULL LOOP
    PERFORM public.sync_plan_stock_from_inventory(r.plan_id);
  END LOOP;
END $$;

-- 3) Server-side price validation on order_items -prevent client tampering.
CREATE OR REPLACE FUNCTION public.tg_validate_order_item_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  plan_price numeric;
  plan_discount numeric;
  expected numeric;
BEGIN
  IF NEW.plan_id IS NULL THEN RETURN NEW; END IF;

  SELECT price, COALESCE(discount_percent, 0)
    INTO plan_price, plan_discount
  FROM public.product_plans
  WHERE id = NEW.plan_id;

  IF plan_price IS NULL THEN
    RAISE EXCEPTION 'invalid_plan_id';
  END IF;

  expected := ROUND((plan_price * (100 - plan_discount) / 100)::numeric, 2);

  -- Tolerance of 1 EGP to allow legitimate promo variations / rounding drift.
  IF ABS(COALESCE(NEW.unit_price, 0) - expected) > 1 THEN
    RAISE EXCEPTION 'unit_price_mismatch: expected % got %', expected, NEW.unit_price;
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_item_price ON public.order_items;
CREATE TRIGGER validate_order_item_price
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_order_item_price();


-- Fix accounting: refunds must be filtered by the ORIGINATING order's date basis,
-- not by refunds.created_at. Also make monthly chart net of refunds so KPI and chart agree.

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

  -- Sum refunds tied to orders that fall inside the same window (by orders.created_at)
  SELECT COALESCE(SUM(r.amount), 0) INTO refund_total
  FROM public.refunds r
  JOIN public.orders o ON o.id = r.order_id
  WHERE o.status IN ('paid','delivered')
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
  WHERE o.status IN ('paid','delivered')
    AND (_start IS NULL OR o.created_at >= _start)
    AND (_end   IS NULL OR o.created_at <  _end);
END;
$function$;

-- Monthly breakdown must also subtract refunds (previously it did not),
-- so the chart totals reconcile with the KPI cards.
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
    WHERE o.status IN ('paid','delivered')
    GROUP BY 1
  ),
  refs AS (
    SELECT date_trunc('month', o.created_at)::date AS m,
           SUM(r.amount)::numeric AS ref
    FROM public.refunds r
    JOIN public.orders o ON o.id = r.order_id
    WHERE o.status IN ('paid','delivered')
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

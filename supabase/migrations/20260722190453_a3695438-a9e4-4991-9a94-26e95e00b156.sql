
CREATE OR REPLACE FUNCTION public.admin_revenue_stats(_start timestamp with time zone DEFAULT NULL, _end timestamp with time zone DEFAULT NULL)
 RETURNS TABLE(revenue numeric, profit numeric, orders_count bigint, items_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  WITH agg AS (
    SELECT
      o.id AS order_id,
      COALESCE(o.discount_amount, 0)::numeric AS disc,
      COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric AS gross,
      COALESCE(SUM((oi.unit_price - COALESCE(pc.cost_price, 0)) * oi.quantity), 0)::numeric AS gross_profit,
      COALESCE(SUM(oi.quantity), 0)::bigint AS qty
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.plan_costs pc ON pc.plan_id = oi.plan_id
    WHERE o.status IN ('paid','delivered','refunded')
      AND (_start IS NULL OR o.created_at >= _start)
      AND (_end   IS NULL OR o.created_at <  _end)
    GROUP BY o.id, o.discount_amount
  )
  SELECT
    COALESCE(SUM(GREATEST(0, gross - disc)), 0)::numeric,
    (COALESCE(SUM(gross_profit - disc), 0) - refund_total)::numeric,
    COUNT(*)::bigint,
    COALESCE(SUM(qty), 0)::bigint
  FROM agg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_revenue_by_month()
 RETURNS TABLE(month date, revenue numeric, profit numeric, orders_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH per_order AS (
    SELECT
      date_trunc('month', o.created_at)::date AS m,
      o.id AS order_id,
      COALESCE(o.discount_amount, 0)::numeric AS disc,
      COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric AS gross,
      COALESCE(SUM((oi.unit_price - COALESCE(pc.cost_price, 0)) * oi.quantity), 0)::numeric AS gross_profit
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.plan_costs pc ON pc.plan_id = oi.plan_id
    WHERE o.status IN ('paid','delivered','refunded')
    GROUP BY 1, o.id, o.discount_amount
  ),
  sales AS (
    SELECT m,
           SUM(GREATEST(0, gross - disc))::numeric AS rev,
           SUM(gross_profit - disc)::numeric AS gprof,
           COUNT(*)::bigint AS oc
    FROM per_order
    GROUP BY m
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

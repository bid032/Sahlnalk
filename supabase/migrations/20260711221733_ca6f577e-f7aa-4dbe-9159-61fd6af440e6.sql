
-- 1) Extend account_type enum with 'own'
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'own';

-- 2) plan_costs (admin-only, isolated from public product_plans reads)
CREATE TABLE IF NOT EXISTS public.plan_costs (
  plan_id uuid PRIMARY KEY REFERENCES public.product_plans(id) ON DELETE CASCADE,
  cost_price numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_costs TO authenticated;
GRANT ALL ON public.plan_costs TO service_role;
ALTER TABLE public.plan_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage plan costs" ON public.plan_costs;
CREATE POLICY "Admins manage plan costs" ON public.plan_costs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) product_plans: sheet URL for CSV-based stock sync
ALTER TABLE public.product_plans
  ADD COLUMN IF NOT EXISTS sheet_csv_url text;

-- 4) Account inventory pool for instant delivery
CREATE TABLE IF NOT EXISTS public.account_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.product_plans(id) ON DELETE CASCADE,
  account_email text,
  account_username text,
  account_password text,
  extra_notes text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','delivered')),
  delivered_order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  delivered_at timestamptz,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_inventory_plan_status_idx
  ON public.account_inventory(plan_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_inventory TO authenticated;
GRANT ALL ON public.account_inventory TO service_role;
ALTER TABLE public.account_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage account inventory" ON public.account_inventory;
CREATE POLICY "Admins manage account inventory" ON public.account_inventory
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users view own delivered inventory" ON public.account_inventory;
CREATE POLICY "Users view own delivered inventory" ON public.account_inventory
  FOR SELECT TO authenticated
  USING (
    delivered_order_item_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = account_inventory.delivered_order_item_id
        AND o.user_id = auth.uid()
    )
  );

-- 5) Guest checkout: allow nullable user_id + anon insert
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;

DROP POLICY IF EXISTS "Anon create guest orders" ON public.orders;
CREATE POLICY "Anon create guest orders" ON public.orders
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND customer_email IS NOT NULL);

DROP POLICY IF EXISTS "Anon insert guest order items" ON public.order_items;
CREATE POLICY "Anon insert guest order items" ON public.order_items
  FOR INSERT TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.user_id IS NULL
  ));

GRANT INSERT ON public.orders TO anon;
GRANT INSERT ON public.order_items TO anon;

-- 6) Atomic inventory claim for instant delivery
CREATE OR REPLACE FUNCTION public.claim_inventory_for_item(_order_item_id uuid, _plan_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_id uuid;
  claimed record;
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

  RETURN claimed_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_inventory_for_item(uuid, uuid) TO authenticated, anon;

-- 7) Revenue analytics (admin-only)
CREATE OR REPLACE FUNCTION public.admin_revenue_stats(_start timestamptz DEFAULT NULL, _end timestamptz DEFAULT NULL)
RETURNS TABLE(revenue numeric, profit numeric, orders_count bigint, items_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric,
    COALESCE(SUM((oi.unit_price - COALESCE(pc.cost_price, 0)) * oi.quantity), 0)::numeric,
    COUNT(DISTINCT o.id),
    COALESCE(SUM(oi.quantity), 0)::bigint
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  LEFT JOIN public.plan_costs pc ON pc.plan_id = oi.plan_id
  WHERE o.status IN ('paid','delivered')
    AND (_start IS NULL OR o.created_at >= _start)
    AND (_end   IS NULL OR o.created_at <  _end);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_revenue_stats(timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revenue_by_month()
RETURNS TABLE(month date, revenue numeric, profit numeric, orders_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    date_trunc('month', o.created_at)::date,
    COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric,
    COALESCE(SUM((oi.unit_price - COALESCE(pc.cost_price, 0)) * oi.quantity), 0)::numeric,
    COUNT(DISTINCT o.id)
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  LEFT JOIN public.plan_costs pc ON pc.plan_id = oi.plan_id
  WHERE o.status IN ('paid','delivered')
  GROUP BY 1
  ORDER BY 1 DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_revenue_by_month() TO authenticated;


-- 1) coupons table
CREATE TYPE public.coupon_discount_type AS ENUM ('percent','fixed');
CREATE TYPE public.coupon_scope AS ENUM ('all','specific');

CREATE TABLE public.coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type public.coupon_discount_type NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  min_order_amount NUMERIC(10,2),
  applies_to public.coupon_scope NOT NULL DEFAULT 'all',
  product_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view coupons" ON public.coupons FOR SELECT
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff manage coupons" ON public.coupons FOR ALL
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX coupons_code_upper_idx ON public.coupons (upper(code));

-- 2) coupon_redemptions table
CREATE TABLE public.coupon_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_discounted NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.coupon_redemptions TO authenticated;
GRANT SELECT, INSERT ON public.coupon_redemptions TO anon;
GRANT ALL ON public.coupon_redemptions TO service_role;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view redemptions" ON public.coupon_redemptions FOR SELECT
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Users view own redemptions" ON public.coupon_redemptions FOR SELECT
  USING (user_id IS NOT NULL AND user_id = auth.uid());
-- Inserts go through SECURITY DEFINER function only; block direct inserts
CREATE POLICY "Block direct inserts" ON public.coupon_redemptions FOR INSERT
  WITH CHECK (false);

CREATE INDEX coupon_redemptions_coupon_idx ON public.coupon_redemptions(coupon_id);
CREATE INDEX coupon_redemptions_order_idx ON public.coupon_redemptions(order_id);

-- 3) alter orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Update the totals recalculator to subtract discount from the current order row
CREATE OR REPLACE FUNCTION public.recalc_order_totals(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_subtotal numeric;
  disc numeric;
BEGIN
  SELECT COALESCE(SUM(unit_price * quantity), 0)::numeric
    INTO new_subtotal
  FROM public.order_items
  WHERE order_id = _order_id;

  SELECT COALESCE(discount_amount, 0) INTO disc
  FROM public.orders WHERE id = _order_id;

  UPDATE public.orders
     SET subtotal = new_subtotal,
         total    = GREATEST(0, new_subtotal - COALESCE(disc, 0))
   WHERE id = _order_id;
END;
$function$;

-- 4) validate_coupon RPC
CREATE OR REPLACE FUNCTION public.validate_coupon(
  _code TEXT,
  _subtotal NUMERIC,
  _product_ids UUID[]
)
RETURNS TABLE(
  valid BOOLEAN,
  message TEXT,
  coupon_id UUID,
  code TEXT,
  discount NUMERIC,
  discount_type TEXT,
  discount_value NUMERIC
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c public.coupons%ROWTYPE;
  eligible_subtotal NUMERIC := 0;
  calc_discount NUMERIC := 0;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(BTRIM(_code)) LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'كود غير صحيح'::text, NULL::uuid, NULL::text, 0::numeric, NULL::text, 0::numeric;
    RETURN;
  END IF;

  IF NOT c.is_active THEN
    RETURN QUERY SELECT false, 'الكود غير مفعّل'::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
    RETURN;
  END IF;

  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN QUERY SELECT false, 'انتهت صلاحية الكود'::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
    RETURN;
  END IF;

  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN QUERY SELECT false, 'تم استنفاد استخدامات الكود'::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
    RETURN;
  END IF;

  IF c.min_order_amount IS NOT NULL AND _subtotal < c.min_order_amount THEN
    RETURN QUERY SELECT false, ('الحد الأدنى للطلب ' || c.min_order_amount::text)::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
    RETURN;
  END IF;

  -- Compute eligible subtotal based on scope
  IF c.applies_to = 'all' THEN
    eligible_subtotal := _subtotal;
  ELSE
    SELECT COALESCE(SUM(t.line_total), 0) INTO eligible_subtotal
    FROM unnest(_product_ids) WITH ORDINALITY AS u(pid, ord)
    JOIN LATERAL (
      SELECT (
        SELECT (pp.price * (100 - COALESCE(p.discount_percent, 0)) / 100)
        FROM public.products p
        JOIN public.product_plans pp ON pp.product_id = p.id
        WHERE p.id = u.pid
        ORDER BY pp.price ASC
        LIMIT 1
      ) AS line_total
    ) t ON true
    WHERE u.pid = ANY(c.product_ids);
    -- If none of the cart items match, invalid
    IF eligible_subtotal <= 0 THEN
      RETURN QUERY SELECT false, 'الكود لا ينطبق على هذه الخدمات'::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
      RETURN;
    END IF;
    -- Cap eligible_subtotal by _subtotal (safety)
    IF eligible_subtotal > _subtotal THEN eligible_subtotal := _subtotal; END IF;
  END IF;

  IF c.discount_type = 'percent' THEN
    calc_discount := ROUND(eligible_subtotal * c.discount_value / 100, 2);
  ELSE
    calc_discount := LEAST(c.discount_value, eligible_subtotal);
  END IF;

  IF calc_discount > _subtotal THEN calc_discount := _subtotal; END IF;
  IF calc_discount < 0 THEN calc_discount := 0; END IF;

  RETURN QUERY SELECT true, 'ok'::text, c.id, c.code, calc_discount, c.discount_type::text, c.discount_value;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, NUMERIC, UUID[]) TO anon, authenticated;

-- 5) redeem_coupon RPC
CREATE OR REPLACE FUNCTION public.redeem_coupon(
  _coupon_id UUID,
  _order_id UUID,
  _amount NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c public.coupons%ROWTYPE;
  ord public.orders%ROWTYPE;
  uid UUID := auth.uid();
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  -- Guest orders (user_id null) allowed; authenticated must own the order or be staff
  IF ord.user_id IS NOT NULL AND uid IS DISTINCT FROM ord.user_id AND NOT public.is_staff(uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO c FROM public.coupons WHERE id = _coupon_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coupon_not_found'; END IF;

  IF NOT c.is_active THEN RAISE EXCEPTION 'coupon_inactive'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN RAISE EXCEPTION 'coupon_expired'; END IF;
  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN RAISE EXCEPTION 'coupon_exhausted'; END IF;

  UPDATE public.coupons SET used_count = used_count + 1 WHERE id = _coupon_id;

  UPDATE public.orders
     SET coupon_id = _coupon_id,
         discount_amount = COALESCE(_amount, 0),
         total = GREATEST(0, subtotal - COALESCE(_amount, 0))
   WHERE id = _order_id;

  INSERT INTO public.coupon_redemptions(coupon_id, order_id, user_id, amount_discounted)
  VALUES (_coupon_id, _order_id, ord.user_id, COALESCE(_amount, 0));

  PERFORM public.log_action('coupon.redeemed','coupon', _coupon_id::text,
    jsonb_build_object('code', c.code, 'order_id', _order_id, 'order_number', ord.order_number, 'amount', _amount));
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon(UUID, UUID, NUMERIC) TO anon, authenticated;

-- 6) Audit triggers for coupons
CREATE OR REPLACE FUNCTION public.tg_audit_coupon()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('coupon.created','coupon',NEW.id::text,
      jsonb_build_object('code', NEW.code, 'discount_type', NEW.discount_type,
        'discount_value', NEW.discount_value, 'applies_to', NEW.applies_to,
        'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW),
      ARRAY['updated_at','created_at','used_count']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('coupon.updated','coupon',NEW.id::text,
      jsonb_build_object('code', NEW.code, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('coupon.deleted','coupon',OLD.id::text,
      jsonb_build_object('code', OLD.code, 'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_coupon
  AFTER INSERT OR UPDATE OR DELETE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_coupon();

-- Migration to update validate_coupon function to accept _items jsonb for exact line total calculation
CREATE OR REPLACE FUNCTION public.validate_coupon(
  _code TEXT,
  _subtotal NUMERIC,
  _product_ids UUID[] DEFAULT ARRAY[]::UUID[],
  _items JSONB DEFAULT NULL
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
  SELECT * INTO c FROM public.coupons AS co WHERE upper(co.code) = upper(BTRIM(_code)) LIMIT 1;
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

  IF c.applies_to = 'all' THEN
    eligible_subtotal := _subtotal;
  ELSE
    IF _items IS NOT NULL AND jsonb_array_length(_items) > 0 THEN
      SELECT COALESCE(SUM(
        COALESCE((item->>'price')::numeric, 0) * COALESCE((item->>'quantity')::numeric, 1)
      ), 0)
      INTO eligible_subtotal
      FROM jsonb_array_elements(_items) AS item
      WHERE (item->>'productId')::uuid = ANY(c.product_ids)
         OR (item->>'product_id')::uuid = ANY(c.product_ids);
    ELSE
      -- Fallback: sum cheapest plan price for matching product_ids
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
    END IF;

    IF eligible_subtotal <= 0 THEN
      RETURN QUERY SELECT false, 'الكود لا ينطبق على هذه الخدمات'::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
      RETURN;
    END IF;
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

GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, NUMERIC, UUID[], JSONB) TO anon, authenticated;

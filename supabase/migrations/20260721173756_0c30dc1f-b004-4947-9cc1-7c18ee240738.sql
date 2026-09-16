CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _subtotal numeric, _product_ids uuid[])
 RETURNS TABLE(valid boolean, message text, coupon_id uuid, code text, discount numeric, discount_type text, discount_value numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
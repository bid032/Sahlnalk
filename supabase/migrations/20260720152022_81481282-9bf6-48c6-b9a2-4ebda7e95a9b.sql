CREATE OR REPLACE FUNCTION public.tg_validate_order_item_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  plan_price numeric;
  plan_discount numeric;
  expected numeric;
BEGIN
  IF NEW.plan_id IS NULL THEN RETURN NEW; END IF;

  SELECT pp.price, COALESCE(p.discount_percent, 0)
    INTO plan_price, plan_discount
  FROM public.product_plans pp
  LEFT JOIN public.products p ON p.id = pp.product_id
  WHERE pp.id = NEW.plan_id;

  IF plan_price IS NULL THEN
    RAISE EXCEPTION 'invalid_plan_id';
  END IF;

  expected := ROUND((plan_price * (100 - plan_discount) / 100)::numeric, 2);

  IF ABS(COALESCE(NEW.unit_price, 0) - expected) > 1 THEN
    RAISE EXCEPTION 'unit_price_mismatch: expected % got %', expected, NEW.unit_price;
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  RETURN NEW;
END;
$function$;
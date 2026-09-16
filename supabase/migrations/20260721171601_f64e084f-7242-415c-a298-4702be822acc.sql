
-- Log plan stock changes when done by an authenticated user (skip only when system-triggered)
CREATE OR REPLACE FUNCTION public.tg_audit_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d jsonb;
  pname text;
  ignore_arr text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name_ar INTO pname FROM public.products WHERE id = NEW.product_id;
    PERFORM public.log_action('plan.created','plan',NEW.id::text,
      jsonb_build_object('product_id', NEW.product_id, 'product_name', pname,
        'label_ar', NEW.label_ar, 'label_en', NEW.label_en, 'price', NEW.price,
        'account_type', NEW.account_type, 'plan_variant', NEW.plan_variant,
        'stock', NEW.stock, 'is_active', NEW.is_active, 'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only ignore stock when the change is system-triggered (no authenticated user, e.g. sheet sync)
    IF auth.uid() IS NULL THEN
      ignore_arr := ARRAY['updated_at','created_at','stock']::text[];
    ELSE
      ignore_arr := ARRAY['updated_at','created_at']::text[];
    END IF;
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ignore_arr);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    SELECT name_ar INTO pname FROM public.products WHERE id = NEW.product_id;
    PERFORM public.log_action('plan.updated','plan',NEW.id::text,
      jsonb_build_object('product_id', NEW.product_id, 'product_name', pname,
        'label_ar', NEW.label_ar, 'price', NEW.price, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name_ar INTO pname FROM public.products WHERE id = OLD.product_id;
    PERFORM public.log_action('plan.deleted','plan',OLD.id::text,
      jsonb_build_object('product_id', OLD.product_id, 'product_name', pname,
        'label_ar', OLD.label_ar, 'price', OLD.price, 'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

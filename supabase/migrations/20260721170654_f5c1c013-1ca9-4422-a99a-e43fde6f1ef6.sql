
-- Generic diff helper: returns {field: {from, to}} of changed keys, ignoring given list
CREATE OR REPLACE FUNCTION public.jsonb_diff(_old jsonb, _new jsonb, _ignore text[] DEFAULT ARRAY['updated_at','created_at']::text[])
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  k text;
  out jsonb := '{}'::jsonb;
BEGIN
  IF _old IS NULL OR _new IS NULL THEN RETURN '{}'::jsonb; END IF;
  FOR k IN SELECT jsonb_object_keys(_new) LOOP
    IF _ignore IS NOT NULL AND k = ANY(_ignore) THEN CONTINUE; END IF;
    IF (_old->k) IS DISTINCT FROM (_new->k) THEN
      out := out || jsonb_build_object(k, jsonb_build_object('from', _old->k, 'to', _new->k));
    END IF;
  END LOOP;
  -- keys removed
  FOR k IN SELECT jsonb_object_keys(_old) LOOP
    IF _ignore IS NOT NULL AND k = ANY(_ignore) THEN CONTINUE; END IF;
    IF NOT (_new ? k) THEN
      out := out || jsonb_build_object(k, jsonb_build_object('from', _old->k, 'to', null));
    END IF;
  END LOOP;
  RETURN out;
END;
$$;

-- ============ PRODUCTS: include diff on update, richer snapshot on create/delete
CREATE OR REPLACE FUNCTION public.tg_audit_product() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('product.created','product',NEW.id::text,
      jsonb_build_object('name_ar', NEW.name_ar, 'name_en', NEW.name_en, 'slug', NEW.slug,
        'status', NEW.status, 'is_featured', NEW.is_featured, 'is_bestseller', NEW.is_bestseller,
        'discount_percent', NEW.discount_percent, 'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW),
      ARRAY['updated_at','created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('product.updated','product',NEW.id::text,
      jsonb_build_object('name_ar', NEW.name_ar, 'slug', NEW.slug, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('product.deleted','product',OLD.id::text,
      jsonb_build_object('name_ar', OLD.name_ar, 'name_en', OLD.name_en, 'slug', OLD.slug,
        'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ============ PLANS: diff on update
CREATE OR REPLACE FUNCTION public.tg_audit_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d jsonb;
  pname text;
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
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW),
      ARRAY['updated_at','created_at','stock']::text[]); -- stock changes are noisy (inventory sync)
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

-- ============ SETTINGS: include value diff
CREATE OR REPLACE FUNCTION public.tg_audit_site_setting() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('setting.updated','setting',NEW.key,
      jsonb_build_object('key', NEW.key, 'changes',
        jsonb_build_object('value', jsonb_build_object('from', null, 'to', NEW.value))));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
      PERFORM public.log_action('setting.updated','setting',NEW.key,
        jsonb_build_object('key', NEW.key, 'changes',
          jsonb_build_object('value', jsonb_build_object('from', OLD.value, 'to', NEW.value))));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('setting.deleted','setting',OLD.key,
      jsonb_build_object('key', OLD.key, 'previous_value', OLD.value));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ============ CATEGORIES
CREATE OR REPLACE FUNCTION public.tg_audit_category() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('category.created','category',NEW.id::text,
      jsonb_build_object('name_ar', NEW.name_ar, 'slug', NEW.slug, 'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at','created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('category.updated','category',NEW.id::text,
      jsonb_build_object('name_ar', NEW.name_ar, 'slug', NEW.slug, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('category.deleted','category',OLD.id::text,
      jsonb_build_object('name_ar', OLD.name_ar, 'slug', OLD.slug, 'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_category ON public.categories;
CREATE TRIGGER trg_audit_category AFTER INSERT OR UPDATE OR DELETE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_category();

-- ============ FAQS
CREATE OR REPLACE FUNCTION public.tg_audit_faq() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('faq.created','faq',NEW.id::text,
      jsonb_build_object('question_ar', NEW.question_ar, 'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at','created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('faq.updated','faq',NEW.id::text,
      jsonb_build_object('question_ar', NEW.question_ar, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('faq.deleted','faq',OLD.id::text,
      jsonb_build_object('question_ar', OLD.question_ar, 'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_faq ON public.faqs;
CREATE TRIGGER trg_audit_faq AFTER INSERT OR UPDATE OR DELETE ON public.faqs
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_faq();

-- ============ REVIEWS
CREATE OR REPLACE FUNCTION public.tg_audit_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d jsonb; pname text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name_ar INTO pname FROM public.products WHERE id = NEW.product_id;
    PERFORM public.log_action('review.created','review',NEW.id::text,
      jsonb_build_object('product_id', NEW.product_id, 'product_name', pname,
        'reviewer_name', NEW.reviewer_name, 'rating', NEW.rating, 'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at','created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    SELECT name_ar INTO pname FROM public.products WHERE id = NEW.product_id;
    PERFORM public.log_action('review.updated','review',NEW.id::text,
      jsonb_build_object('product_id', NEW.product_id, 'product_name', pname,
        'reviewer_name', NEW.reviewer_name, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name_ar INTO pname FROM public.products WHERE id = OLD.product_id;
    PERFORM public.log_action('review.deleted','review',OLD.id::text,
      jsonb_build_object('product_id', OLD.product_id, 'product_name', pname,
        'reviewer_name', OLD.reviewer_name, 'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_review ON public.product_reviews;
CREATE TRIGGER trg_audit_review AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_review();

-- ============ TESTIMONIAL IMAGES
CREATE OR REPLACE FUNCTION public.tg_audit_testimonial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('testimonial.created','testimonial',NEW.id::text,
      jsonb_build_object('image_url', NEW.image_url, 'caption', NEW.caption));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('testimonial.updated','testimonial',NEW.id::text,
      jsonb_build_object('caption', NEW.caption, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('testimonial.deleted','testimonial',OLD.id::text,
      jsonb_build_object('image_url', OLD.image_url, 'caption', OLD.caption));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_testimonial ON public.testimonial_images;
CREATE TRIGGER trg_audit_testimonial AFTER INSERT OR UPDATE OR DELETE ON public.testimonial_images
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_testimonial();

-- ============ ORDERS: log creation as well (in addition to status change)
CREATE OR REPLACE FUNCTION public.tg_audit_order_create() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.log_action('order.created','order',NEW.id::text,
    jsonb_build_object('order_number', NEW.order_number, 'status', NEW.status,
      'total', NEW.total, 'customer_email', NEW.customer_email,
      'customer_name', NEW.customer_name, 'payment_gateway', NEW.payment_gateway));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_order_create ON public.orders;
CREATE TRIGGER trg_audit_order_create AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_order_create();

-- ============ REFUNDS: also track updates (notes/amount edits)
CREATE OR REPLACE FUNCTION public.tg_audit_refund() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('refund.created','refund',NEW.id::text,
      jsonb_build_object('order_id', NEW.order_id, 'order_item_id', NEW.order_item_id,
        'amount', NEW.amount, 'type', NEW.type, 'notes', NEW.notes));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at','created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('refund.updated','refund',NEW.id::text,
      jsonb_build_object('order_id', NEW.order_id, 'order_item_id', NEW.order_item_id,
        'amount', NEW.amount, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('refund.deleted','refund',OLD.id::text,
      jsonb_build_object('order_id', OLD.order_id, 'order_item_id', OLD.order_item_id,
        'amount', OLD.amount, 'type', OLD.type));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_refund ON public.refunds;
DROP TRIGGER IF EXISTS trg_audit_refund_upd ON public.refunds;
CREATE TRIGGER trg_audit_refund AFTER INSERT OR UPDATE OR DELETE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_refund();

-- ============ PLAN COSTS
CREATE OR REPLACE FUNCTION public.tg_audit_plan_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d jsonb; pname text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.name_ar INTO pname FROM public.product_plans pp
      JOIN public.products p ON p.id = pp.product_id WHERE pp.id = NEW.plan_id;
    PERFORM public.log_action('plan_cost.updated','plan',NEW.plan_id::text,
      jsonb_build_object('product_name', pname, 'changes',
        jsonb_build_object('cost_price', jsonb_build_object('from', null, 'to', NEW.cost_price))));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.cost_price IS DISTINCT FROM NEW.cost_price THEN
      SELECT p.name_ar INTO pname FROM public.product_plans pp
        JOIN public.products p ON p.id = pp.product_id WHERE pp.id = NEW.plan_id;
      PERFORM public.log_action('plan_cost.updated','plan',NEW.plan_id::text,
        jsonb_build_object('product_name', pname, 'changes',
          jsonb_build_object('cost_price', jsonb_build_object('from', OLD.cost_price, 'to', NEW.cost_price))));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('plan_cost.deleted','plan',OLD.plan_id::text,
      jsonb_build_object('cost_price', OLD.cost_price));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_plan_cost ON public.plan_costs;
CREATE TRIGGER trg_audit_plan_cost AFTER INSERT OR UPDATE OR DELETE ON public.plan_costs
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_plan_cost();

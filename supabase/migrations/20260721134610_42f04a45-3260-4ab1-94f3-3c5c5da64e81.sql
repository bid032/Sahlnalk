
-- 1) audit_log table
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_actor ON public.audit_log(actor_id);
CREATE INDEX idx_audit_log_target ON public.audit_log(target_type, target_id);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only staff can view
CREATE POLICY "Staff can view audit log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Nobody edits/deletes directly (only via triggers/functions with security definer)
CREATE POLICY "Nobody can insert directly" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- 2) helper to log an action
CREATE OR REPLACE FUNCTION public.log_action(
  _action_type TEXT,
  _target_type TEXT,
  _target_id TEXT,
  _meta JSONB DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  uname TEXT;
BEGIN
  IF uid IS NOT NULL THEN
    SELECT COALESCE(NULLIF(BTRIM(p.display_name), ''), u.email::text)
      INTO uname
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      WHERE p.id = uid;
  END IF;

  INSERT INTO public.audit_log(actor_id, actor_name, action_type, target_type, target_id, meta)
  VALUES (uid, uname, _action_type, _target_type, _target_id, COALESCE(_meta, '{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_action(TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- 3) trigger: order status change
CREATE OR REPLACE FUNCTION public.tg_audit_order_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_action(
      'order.status_change',
      'order',
      NEW.id::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'order_number', NEW.order_number)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_order_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_order_status();

-- 4) trigger: order_item status change (delivery / refund at item level)
CREATE OR REPLACE FUNCTION public.tg_audit_order_item_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_action(
      CASE NEW.status
        WHEN 'delivered' THEN 'order_item.delivered'
        WHEN 'refunded' THEN 'order_item.refunded'
        ELSE 'order_item.status_change'
      END,
      'order_item',
      NEW.id::text,
      jsonb_build_object(
        'from', OLD.status, 'to', NEW.status,
        'order_id', NEW.order_id,
        'product_name', NEW.product_name,
        'plan_label', NEW.plan_label
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_order_item_status
AFTER UPDATE OF status ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_order_item_status();

-- 5) trigger: refunds insert / delete
CREATE OR REPLACE FUNCTION public.tg_audit_refund() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action(
      'refund.created',
      'refund',
      NEW.id::text,
      jsonb_build_object('order_id', NEW.order_id, 'order_item_id', NEW.order_item_id, 'amount', NEW.amount, 'type', NEW.type, 'notes', NEW.notes)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action(
      'refund.deleted',
      'refund',
      OLD.id::text,
      jsonb_build_object('order_id', OLD.order_id, 'order_item_id', OLD.order_item_id, 'amount', OLD.amount, 'type', OLD.type)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_refund_ins AFTER INSERT ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_refund();
CREATE TRIGGER trg_audit_refund_del AFTER DELETE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_refund();

-- 6) trigger: products create/update/delete
CREATE OR REPLACE FUNCTION public.tg_audit_product() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('product.created','product',NEW.id::text,
      jsonb_build_object('name_ar', NEW.name_ar, 'slug', NEW.slug));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_action('product.updated','product',NEW.id::text,
      jsonb_build_object('name_ar', NEW.name_ar, 'slug', NEW.slug));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('product.deleted','product',OLD.id::text,
      jsonb_build_object('name_ar', OLD.name_ar, 'slug', OLD.slug));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_product AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_product();

-- 7) trigger: product_plans create/update/delete
CREATE OR REPLACE FUNCTION public.tg_audit_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('plan.created','plan',NEW.id::text,
      jsonb_build_object('product_id', NEW.product_id, 'label_ar', NEW.label_ar, 'price', NEW.price));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_action('plan.updated','plan',NEW.id::text,
      jsonb_build_object('product_id', NEW.product_id, 'label_ar', NEW.label_ar, 'price', NEW.price));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('plan.deleted','plan',OLD.id::text,
      jsonb_build_object('product_id', OLD.product_id, 'label_ar', OLD.label_ar));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_plan AFTER INSERT OR UPDATE OR DELETE ON public.product_plans
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_plan();

-- 8) trigger: user_roles changes
CREATE OR REPLACE FUNCTION public.tg_audit_user_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('role.granted','user_role',NEW.user_id::text,
      jsonb_build_object('role', NEW.role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('role.revoked','user_role',OLD.user_id::text,
      jsonb_build_object('role', OLD.role));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_user_role AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_user_role();

-- 9) trigger: site_settings changes
CREATE OR REPLACE FUNCTION public.tg_audit_site_setting() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.log_action('setting.updated','setting',NEW.key,
      jsonb_build_object('key', NEW.key));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('setting.deleted','setting',OLD.key,
      jsonb_build_object('key', OLD.key));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_site_setting AFTER INSERT OR UPDATE OR DELETE ON public.site_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_site_setting();

-- 10) trigger: delivered_accounts (manual delivery)
CREATE OR REPLACE FUNCTION public.tg_audit_delivered_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.log_action('delivery.manual','order_item',NEW.order_item_id::text,
    jsonb_build_object('account_email', NEW.account_email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_delivered_account AFTER INSERT ON public.delivered_accounts
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_delivered_account();

-- 11) seed initial page/shop-intro settings keys (empty values, admin fills later)
INSERT INTO public.site_settings(key, value) VALUES
  ('shop_intro', '{"ar":"","en":""}'::jsonb),
  ('page_about', '{"ar":"","en":""}'::jsonb),
  ('page_terms', '{"ar":"","en":""}'::jsonb),
  ('page_privacy', '{"ar":"","en":""}'::jsonb),
  ('page_refund', '{"ar":"","en":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

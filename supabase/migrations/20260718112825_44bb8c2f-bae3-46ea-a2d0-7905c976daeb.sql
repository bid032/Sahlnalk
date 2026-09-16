
-- Add phone and country to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS country text;

-- FAQs table (admin-managed)
CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_ar text NOT NULL,
  question_en text NOT NULL,
  answer_ar text NOT NULL,
  answer_en text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.faqs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faqs TO authenticated;
GRANT ALL ON public.faqs TO service_role;

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faqs public read active" ON public.faqs
  FOR SELECT USING (is_active = true);
CREATE POLICY "faqs admin read all" ON public.faqs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "faqs admin insert" ON public.faqs
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "faqs admin update" ON public.faqs
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "faqs admin delete" ON public.faqs
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER faqs_updated_at BEFORE UPDATE ON public.faqs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a few defaults
INSERT INTO public.faqs (question_ar, question_en, answer_ar, answer_en, sort_order) VALUES
  ('كم يستغرق التسليم؟', 'How long does delivery take?', 'التسليم فوري بعد تأكيد الدفع.', 'Instant delivery after payment confirmation.', 1),
  ('هل الاشتراكات أصلية؟', 'Are the subscriptions genuine?', 'نعم، جميع الاشتراكات أصلية 100%.', 'Yes, all subscriptions are 100% genuine.', 2),
  ('هل يوجد ضمان؟', 'Is there a warranty?', 'نعم، نوفر ضمان طوال فترة الاشتراك.', 'Yes, we provide a warranty throughout the subscription period.', 3);

-- Refunds / compensations table
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  type text NOT NULL CHECK (type IN ('full','partial','replacement')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refunds user read own" ON public.refunds
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "refunds admin insert" ON public.refunds
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "refunds admin update" ON public.refunds
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "refunds admin delete" ON public.refunds
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER refunds_updated_at BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update handle_new_user to store phone/country from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone, country)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'country'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  IF lower(NEW.email) = 'bidotito1@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Update revenue stats to subtract refunds
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

  SELECT COALESCE(SUM(amount), 0) INTO refund_total
  FROM public.refunds
  WHERE (_start IS NULL OR created_at >= _start)
    AND (_end IS NULL OR created_at <  _end);

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

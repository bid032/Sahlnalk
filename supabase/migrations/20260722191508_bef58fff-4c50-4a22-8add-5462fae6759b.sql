DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'order_items','products','product_plans','categories','coupons','coupon_redemptions',
    'refunds','faqs','testimonial_images','product_reviews','user_roles','profiles',
    'site_settings','account_inventory','delivered_accounts','plan_costs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- ensure orders + audit_log also have REPLICA IDENTITY FULL for complete payloads
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;
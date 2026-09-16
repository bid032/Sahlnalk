-- 1) Public read allowlist on site_settings was missing the keys the public
--    pages actually render (payment numbers + page content), so dashboard
--    edits never reached visitors. Extend the allowlist.
DROP POLICY IF EXISTS "Public views safe settings" ON public.site_settings;

CREATE POLICY "Public views safe settings"
  ON public.site_settings
  FOR SELECT
  USING (
    key IN (
      'brand','contact','payments','checkout','hero','socials','stats','theme_mode',
      'wallet_number','instapay_number',
      'shop_intro','page_about','page_terms','page_refund','page_privacy',
      'paypal_client_id','paypal_enabled','usd_exchange_rate'
    )
  );

-- 2) Realtime: make sure public-facing tables broadcast changes so the site
--    refreshes itself the moment something is saved in the dashboard.
ALTER TABLE public.site_settings REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.product_plans REPLICA IDENTITY FULL;
ALTER TABLE public.categories REPLICA IDENTITY FULL;
ALTER TABLE public.faqs REPLICA IDENTITY FULL;
ALTER TABLE public.testimonial_images REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'site_settings','products','product_plans','categories','faqs','testimonial_images'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Grant public/anon SELECT access to Meta Pixel ID & PayPal public settings keys
-- (meta_pixel_id, paypal_client_id, paypal_enabled, usd_exchange_rate)
-- so guest checkout & Meta Pixel can load properly for all visitors.

DROP POLICY IF EXISTS "Public views safe settings" ON public.site_settings;

CREATE POLICY "Public views safe settings"
  ON public.site_settings
  FOR SELECT
  USING (
    key IN (
      'brand','contact','payments','checkout','hero','socials','stats','theme_mode',
      'wallet_number','instapay_number',
      'shop_intro','page_about','page_terms','page_refund','page_privacy',
      'paypal_client_id','paypal_enabled','usd_exchange_rate',
      'meta_pixel_id'
    )
  );

DROP POLICY IF EXISTS "anon read public settings" ON public.site_settings;

CREATE POLICY "anon read public settings"
  ON public.site_settings
  FOR SELECT
  TO anon
  USING (
    key IN (
      'brand','contact','payments','checkout','hero','socials','stats','theme_mode',
      'wallet_number','instapay_number',
      'shop_intro','page_about','page_terms','page_refund','page_privacy',
      'paypal_client_id','paypal_enabled','usd_exchange_rate',
      'meta_pixel_id'
    )
  );

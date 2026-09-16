
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_default_admin_on_confirm() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_plan_stock_on_order_item() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can upload payment proofs" ON storage.objects;

CREATE POLICY "Constrained payment proof uploads"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (
    (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text)
    OR ((storage.foldername(name))[1] = 'guest')
  )
  AND COALESCE((metadata->>'size')::bigint, 0) <= 5242880
  AND COALESCE(metadata->>'mimetype', '') IN (
    'image/png','image/jpeg','image/jpg','image/webp','image/gif','application/pdf'
  )
);

INSERT INTO public.site_settings (key, value)
VALUES ('admin_notify_email', to_jsonb('bidotito1@gmail.com'::text))
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);

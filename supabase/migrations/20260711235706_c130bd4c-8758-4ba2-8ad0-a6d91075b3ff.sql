
ALTER TYPE public.payment_gateway ADD VALUE IF NOT EXISTS 'wallet_instapay';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS payment_sender_phone text;

DROP POLICY IF EXISTS "Anyone can upload payment proofs" ON storage.objects;
CREATE POLICY "Anyone can upload payment proofs"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "Admins can read payment proofs" ON storage.objects;
CREATE POLICY "Admins can read payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'));

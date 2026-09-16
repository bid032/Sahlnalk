DROP POLICY IF EXISTS "Admins can read payment proofs" ON storage.objects;
CREATE POLICY "Admins and moderators can read payment proofs" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'payment-proofs' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')));
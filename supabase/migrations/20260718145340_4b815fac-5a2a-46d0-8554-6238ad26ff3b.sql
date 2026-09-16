
DROP POLICY IF EXISTS "refunds admin delete" ON public.refunds;
DROP POLICY IF EXISTS "refunds admin insert" ON public.refunds;
DROP POLICY IF EXISTS "refunds admin update" ON public.refunds;
DROP POLICY IF EXISTS "refunds user read own" ON public.refunds;

CREATE POLICY "refunds staff read" ON public.refunds FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'));
CREATE POLICY "refunds staff insert" ON public.refunds FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'));
CREATE POLICY "refunds staff update" ON public.refunds FOR UPDATE
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'));
CREATE POLICY "refunds staff delete" ON public.refunds FOR DELETE
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'));

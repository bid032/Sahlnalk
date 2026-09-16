
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "Admin can delete audit log" ON public.audit_log;
CREATE POLICY "Admin can delete audit log" ON public.audit_log
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

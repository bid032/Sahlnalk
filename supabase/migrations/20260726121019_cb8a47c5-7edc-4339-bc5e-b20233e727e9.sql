-- 1) Table
CREATE TABLE IF NOT EXISTS public.google_sheet_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  spreadsheet_id TEXT NOT NULL,
  worksheet_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT google_sheet_integrations_sheet_unique UNIQUE (spreadsheet_id, worksheet_name)
);

CREATE INDEX IF NOT EXISTS idx_gsi_slug ON public.google_sheet_integrations (slug);
CREATE INDEX IF NOT EXISTS idx_gsi_enabled ON public.google_sheet_integrations (enabled);

-- 2) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_sheet_integrations TO authenticated;
GRANT ALL ON public.google_sheet_integrations TO service_role;

-- 3) RLS
ALTER TABLE public.google_sheet_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_gsi" ON public.google_sheet_integrations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_insert_gsi" ON public.google_sheet_integrations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_update_gsi" ON public.google_sheet_integrations
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_delete_gsi" ON public.google_sheet_integrations
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) updated_at trigger
DROP TRIGGER IF EXISTS trg_gsi_updated_at ON public.google_sheet_integrations;
CREATE TRIGGER trg_gsi_updated_at
BEFORE UPDATE ON public.google_sheet_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Auto-migrate existing site_settings.stock_sheet → stock + staff rows
DO $$
DECLARE
  cfg jsonb;
  sid text;
  wtitle text;
BEGIN
  SELECT value INTO cfg FROM public.site_settings WHERE key = 'stock_sheet';
  IF cfg IS NULL THEN RETURN; END IF;
  sid := NULLIF(BTRIM(cfg->>'spreadsheet_id'), '');
  wtitle := COALESCE(NULLIF(BTRIM(cfg->>'sheet_title'), ''), 'Stock');
  IF sid IS NULL THEN RETURN; END IF;

  INSERT INTO public.google_sheet_integrations (name, slug, description, spreadsheet_id, worksheet_name, enabled)
  VALUES ('المخزون', 'stock', 'شيت مخزون الحسابات (اتنقل تلقائياً من الإعدادات القديمة)', sid, wtitle, true)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.google_sheet_integrations (name, slug, description, spreadsheet_id, worksheet_name, enabled)
  VALUES ('الموظفين', 'staff', 'شيت بيانات دخول الموظفين', sid, 'Staff', true)
  ON CONFLICT (slug) DO NOTHING;
END $$;
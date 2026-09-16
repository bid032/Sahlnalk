
-- Restrict public read access on site_settings to a small allowlist of non-sensitive keys.
DROP POLICY IF EXISTS "Anyone views settings" ON public.site_settings;

CREATE POLICY "Public views safe settings"
  ON public.site_settings
  FOR SELECT
  USING (key IN ('brand','contact','payments','checkout','hero','socials','stats','theme_mode'));

-- Allow moderators to read all settings (admins already have ALL via existing policy).
CREATE POLICY "Moderators view settings"
  ON public.site_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'));

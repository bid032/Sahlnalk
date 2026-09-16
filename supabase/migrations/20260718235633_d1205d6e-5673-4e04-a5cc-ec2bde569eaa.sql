
-- Stock access + per-user password + site setting for spreadsheet
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stock_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_password_hash text;

-- Admin sets a user's stock access + password (nullable password = clear/no gate)
CREATE OR REPLACE FUNCTION public.admin_set_stock_access(
  _user_id uuid,
  _access boolean,
  _password text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles
     SET stock_access = _access,
         stock_password_hash = CASE
           WHEN _password IS NULL OR length(_password) = 0 THEN stock_password_hash
           ELSE crypt(_password, gen_salt('bf', 10))
         END
   WHERE id = _user_id;
END;
$$;

-- Current user verifies their stock password
CREATE OR REPLACE FUNCTION public.verify_stock_password(_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
  h text;
  ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT stock_password_hash INTO h FROM public.profiles
   WHERE id = auth.uid() AND stock_access = true;
  IF h IS NULL THEN RETURN false; END IF;
  SELECT (crypt(_password, h) = h) INTO ok;
  RETURN COALESCE(ok, false);
END;
$$;

-- Current user checks if they even have stock access (used for header link)
CREATE OR REPLACE FUNCTION public.current_user_stock_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT stock_access FROM public.profiles WHERE id = auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION public.admin_set_stock_access(uuid, boolean, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_stock_access(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_stock_password(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_stock_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_stock_access() TO authenticated;

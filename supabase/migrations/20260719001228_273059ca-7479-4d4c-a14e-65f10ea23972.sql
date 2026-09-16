CREATE OR REPLACE FUNCTION public.admin_set_stock_access(_user_id uuid, _access boolean, _password text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  normalized_password text := NULLIF(BTRIM(_password), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF normalized_password IS NOT NULL AND normalized_password !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'stock_password_must_be_4_digits';
  END IF;

  UPDATE public.profiles
     SET stock_access = _access,
         stock_password_hash = CASE
           WHEN normalized_password IS NULL THEN stock_password_hash
           ELSE crypt(normalized_password, gen_salt('bf', 10))
         END
   WHERE id = _user_id;
END;
$$;
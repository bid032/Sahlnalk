
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone, country)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(BTRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(BTRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(BTRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(BTRIM(NEW.raw_user_meta_data->>'user_name'), ''),
      NEW.email
    ),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'country'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  IF lower(NEW.email) = 'bidotito1@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill existing Google users whose display_name still equals their email
UPDATE public.profiles p
SET display_name = COALESCE(
  NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'), ''),
  NULLIF(BTRIM(u.raw_user_meta_data->>'name'), ''),
  p.display_name
)
FROM auth.users u
WHERE u.id = p.id
  AND (p.display_name IS NULL OR p.display_name = u.email)
  AND (
    NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'), '') IS NOT NULL
    OR NULLIF(BTRIM(u.raw_user_meta_data->>'name'), '') IS NOT NULL
  );


-- Triggers: no direct callers.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_default_admin_on_confirm() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrement_plan_stock_on_order_item() FROM PUBLIC, anon, authenticated;

-- Admin RPCs: signed-in only; each checks has_role() internally.
REVOKE ALL ON FUNCTION public.admin_revenue_by_month() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revenue_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_stock_access(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revenue_by_month() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_stats(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_stock_access(uuid, boolean, text) TO authenticated;

-- Signed-in only (guests must not call these).
REVOKE ALL ON FUNCTION public.current_user_stock_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_stock_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_stock_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_stock_password(text) TO authenticated;

-- has_role: needed by RLS policies for authenticated users; deny anon.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- Checkout may be guest, so keep claim_inventory_for_item callable by anon/authenticated.
GRANT EXECUTE ON FUNCTION public.claim_inventory_for_item(uuid, uuid) TO anon, authenticated;

-- Boolean-only helper so the client never selects stock_password_hash.
CREATE OR REPLACE FUNCTION public.admin_user_has_stock_password(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT stock_password_hash IS NOT NULL AND stock_password_hash <> ''
       FROM public.profiles
      WHERE id = _user_id
        AND public.has_role(auth.uid(), 'admin')),
    false
  );
$$;
REVOKE ALL ON FUNCTION public.admin_user_has_stock_password(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_has_stock_password(uuid) TO authenticated;

-- Rebuild admin_list_users with an extra column (has_stock_password).
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id uuid,
  display_name text,
  email text,
  created_at timestamptz,
  has_stock_password boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id,
         p.display_name,
         u.email::text,
         p.created_at,
         (p.stock_password_hash IS NOT NULL AND p.stock_password_hash <> '') AS has_stock_password
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

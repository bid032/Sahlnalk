
-- 1) Prevent listing of files in public buckets (public URL access still works via CDN)
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
DROP POLICY IF EXISTS "Public read testimonial images" ON storage.objects;

-- 2) Revoke EXECUTE on trigger-only SECURITY DEFINER functions from clients
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_default_admin_on_confirm() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_plan_stock_on_order_item() FROM PUBLIC, anon, authenticated;

-- 3) Admin-only RPCs: revoke from anon (function still self-checks admin role for authenticated)
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revenue_by_month() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revenue_stats(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_by_month() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_stats(timestamptz, timestamptz) TO authenticated;

-- 4) claim_inventory_for_item must remain callable by checkout (anon + authenticated)
--    but only the caller who owns the order_item should benefit; guard added inside function
CREATE OR REPLACE FUNCTION public.claim_inventory_for_item(_order_item_id uuid, _plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claimed_id uuid;
  claimed record;
  remaining int;
  order_owner uuid;
  order_email text;
BEGIN
  -- Ensure the caller is allowed to claim inventory for this order_item:
  -- either the order belongs to them (authenticated), or it's a guest order (user_id IS NULL).
  SELECT o.user_id, o.customer_email INTO order_owner, order_email
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = _order_item_id AND oi.plan_id = _plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order item not found';
  END IF;

  IF order_owner IS NOT NULL AND order_owner <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO claimed_id
  FROM public.account_inventory
  WHERE plan_id = _plan_id AND status = 'available'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.account_inventory
  SET status = 'delivered',
      delivered_order_item_id = _order_item_id,
      delivered_at = now()
  WHERE id = claimed_id
  RETURNING account_email, account_username, account_password, extra_notes INTO claimed;

  INSERT INTO public.delivered_accounts (order_item_id, account_email, account_username, account_password, extra_notes)
  VALUES (_order_item_id, claimed.account_email, claimed.account_username, claimed.account_password, claimed.extra_notes);

  SELECT COUNT(*) INTO remaining
  FROM public.account_inventory
  WHERE plan_id = _plan_id AND status = 'available';

  UPDATE public.product_plans SET stock = remaining WHERE id = _plan_id;

  RETURN claimed_id;
END;
$function$;

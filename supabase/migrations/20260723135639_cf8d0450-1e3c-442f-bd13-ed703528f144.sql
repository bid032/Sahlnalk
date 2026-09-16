
-- Fix 1: Reduce Realtime data exposure on sensitive tables
-- REPLICA IDENTITY FULL exposes ALL old column values on UPDATE/DELETE.
-- DEFAULT only exposes the primary key, which is what Realtime actually needs.
ALTER TABLE public.account_inventory REPLICA IDENTITY DEFAULT;
ALTER TABLE public.coupons REPLICA IDENTITY DEFAULT;
ALTER TABLE public.delivered_accounts REPLICA IDENTITY DEFAULT;
ALTER TABLE public.order_items REPLICA IDENTITY DEFAULT;
ALTER TABLE public.orders REPLICA IDENTITY DEFAULT;
ALTER TABLE public.profiles REPLICA IDENTITY DEFAULT;
ALTER TABLE public.refunds REPLICA IDENTITY DEFAULT;

-- Fix 2: Prevent guest checkout from impersonating an existing registered user's email
CREATE OR REPLACE FUNCTION public.tg_prevent_guest_impersonation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.customer_email IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM auth.users
      WHERE lower(email) = lower(BTRIM(NEW.customer_email))
    ) THEN
      RAISE EXCEPTION 'email_belongs_to_registered_user'
        USING HINT = 'Please sign in to place an order with this email address.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_guest_impersonation ON public.orders;
CREATE TRIGGER prevent_guest_impersonation
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_prevent_guest_impersonation();

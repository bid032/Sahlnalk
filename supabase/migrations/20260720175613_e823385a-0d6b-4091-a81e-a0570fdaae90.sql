
-- Server-side recomputation of order totals from items (ignores client-supplied values)
CREATE OR REPLACE FUNCTION public.recalc_order_totals(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_subtotal numeric;
BEGIN
  SELECT COALESCE(SUM(unit_price * quantity), 0)::numeric
    INTO new_subtotal
  FROM public.order_items
  WHERE order_id = _order_id;

  UPDATE public.orders
     SET subtotal = new_subtotal,
         total    = new_subtotal
   WHERE id = _order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_recalc_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_order_totals(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_order_totals(NEW.order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_recalc ON public.order_items;
CREATE TRIGGER trg_order_items_recalc
AFTER INSERT OR UPDATE OF unit_price, quantity OR DELETE
ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_order_totals();

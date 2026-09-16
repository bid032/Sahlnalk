
-- 1) Enum for per-item status
DO $$ BEGIN
  CREATE TYPE public.order_item_status AS ENUM ('pending','delivered','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Column on order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS status public.order_item_status NOT NULL DEFAULT 'pending';

-- 3) Backfill existing rows
UPDATE public.order_items oi
   SET status = 'delivered'
 WHERE EXISTS (SELECT 1 FROM public.delivered_accounts da WHERE da.order_item_id = oi.id)
   AND oi.status <> 'delivered';

UPDATE public.order_items oi
   SET status = 'refunded'
 WHERE EXISTS (SELECT 1 FROM public.refunds r WHERE r.order_item_id = oi.id AND r.amount >= oi.unit_price * oi.quantity)
   AND oi.status = 'pending';

-- 4) Trigger: auto-flip order.status to 'delivered' when all items delivered
CREATE OR REPLACE FUNCTION public.tg_sync_order_status_from_items()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_cnt int;
  delivered_cnt int;
  cur_status public.order_status;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'delivered')
    INTO total_cnt, delivered_cnt
  FROM public.order_items
  WHERE order_id = COALESCE(NEW.order_id, OLD.order_id);

  IF total_cnt = 0 THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT status INTO cur_status FROM public.orders
   WHERE id = COALESCE(NEW.order_id, OLD.order_id);

  IF delivered_cnt = total_cnt AND cur_status IS DISTINCT FROM 'delivered' AND cur_status <> 'refunded' THEN
    UPDATE public.orders SET status = 'delivered'
     WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_status_from_items ON public.order_items;
CREATE TRIGGER trg_sync_order_status_from_items
AFTER INSERT OR UPDATE OF status ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_order_status_from_items();

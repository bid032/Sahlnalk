
-- Remove orphan refunds (order/order_item no longer exists)
DELETE FROM public.refunds WHERE order_id IS NULL AND order_item_id IS NULL;

-- Recreate FKs with ON DELETE CASCADE so refunds die with their order/item
ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_order_id_fkey;
ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_order_item_id_fkey;
ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_order_item_id_fkey
  FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;

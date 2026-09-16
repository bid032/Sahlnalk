ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS refunds_order_id_idx ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS refunds_order_item_id_idx ON public.refunds(order_item_id);
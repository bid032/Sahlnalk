-- Add frozen_unit_price column to order_items to store the price at time of purchase
BEGIN;

-- Add new column to store the frozen price
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS frozen_unit_price NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Backfill existing data with current unit_price values
UPDATE public.order_items SET frozen_unit_price = unit_price;

-- Create a trigger to automatically set frozen_unit_price on insert
CREATE OR REPLACE FUNCTION public.tg_set_frozen_unit_price()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.frozen_unit_price = NEW.unit_price;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_frozen_unit_price ON public.order_items;
CREATE TRIGGER trg_set_frozen_unit_price
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_set_frozen_unit_price();

-- Update policies to allow access to the new column
CREATE OR REPLACE POLICY "Users view own order items" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

COMMIT;
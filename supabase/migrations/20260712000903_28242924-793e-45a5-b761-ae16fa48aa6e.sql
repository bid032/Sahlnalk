CREATE POLICY "Admins delete orders" ON public.orders FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete order items" ON public.order_items FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
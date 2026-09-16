
-- Allow moderators to view and update orders (approve/change status) like admins.
-- Deletes remain admin-only.

DROP POLICY IF EXISTS "Users view own orders" ON public.orders;
CREATE POLICY "Users view own orders" ON public.orders
FOR SELECT USING (
  (auth.uid() = user_id)
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'moderator')
);

DROP POLICY IF EXISTS "Admins update orders" ON public.orders;
CREATE POLICY "Admins update orders" ON public.orders
FOR UPDATE USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'moderator')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'moderator')
);

DROP POLICY IF EXISTS "Users view own order items" ON public.order_items;
CREATE POLICY "Users view own order items" ON public.order_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
      )
  )
);

DROP POLICY IF EXISTS "Users view own delivered accounts" ON public.delivered_accounts;
CREATE POLICY "Users view own delivered accounts" ON public.delivered_accounts
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = delivered_accounts.order_item_id
      AND (
        o.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
      )
  )
);

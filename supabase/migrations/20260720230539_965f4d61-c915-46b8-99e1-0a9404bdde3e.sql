
-- Helper: staff = admin or moderator
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'moderator');
$$;

-- Products
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
DROP POLICY IF EXISTS "Anyone views active products" ON public.products;
CREATE POLICY "Staff manage products" ON public.products FOR ALL
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Anyone views active products" ON public.products FOR SELECT
  USING (status = 'active' OR public.is_staff(auth.uid()));

-- Product plans
DROP POLICY IF EXISTS "Admins manage product plans" ON public.product_plans;
DROP POLICY IF EXISTS "Anyone views active product plans" ON public.product_plans;
CREATE POLICY "Staff manage product plans" ON public.product_plans FOR ALL
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Anyone views active product plans" ON public.product_plans FOR SELECT
  USING (is_active = true OR public.is_staff(auth.uid()));

-- Categories
DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone views active categories" ON public.categories;
CREATE POLICY "Staff manage categories" ON public.categories FOR ALL
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Anyone views active categories" ON public.categories FOR SELECT
  USING (is_active = true OR public.is_staff(auth.uid()));

-- Account inventory
DROP POLICY IF EXISTS "Admins manage account inventory" ON public.account_inventory;
CREATE POLICY "Staff manage account inventory" ON public.account_inventory FOR ALL
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Delivered accounts
DROP POLICY IF EXISTS "Admins manage delivered accounts" ON public.delivered_accounts;
CREATE POLICY "Staff manage delivered accounts" ON public.delivered_accounts FOR ALL
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Plan costs
DROP POLICY IF EXISTS "Admins manage plan costs" ON public.plan_costs;
CREATE POLICY "Staff manage plan costs" ON public.plan_costs FOR ALL
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Orders: broaden any admin-only policy to staff (keep user-owned policies intact)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('orders','order_items','product_reviews','refunds','testimonial_images')
      AND (qual LIKE '%''admin''::app_role%' OR with_check LIKE '%''admin''::app_role%')
      AND qual NOT LIKE '%moderator%' AND (with_check IS NULL OR with_check NOT LIKE '%moderator%')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Orders (staff can view + update status, users keep own)
CREATE POLICY "Staff view all orders" ON public.orders FOR SELECT
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff update orders" ON public.orders FOR UPDATE
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff delete orders" ON public.orders FOR DELETE
  USING (public.is_staff(auth.uid()));

-- Order items
CREATE POLICY "Staff view all order items" ON public.order_items FOR SELECT
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff update order items" ON public.order_items FOR UPDATE
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff delete order items" ON public.order_items FOR DELETE
  USING (public.is_staff(auth.uid()));

-- Product reviews (staff moderate)
CREATE POLICY "Staff manage product reviews" ON public.product_reviews FOR ALL
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Refunds
CREATE POLICY "Staff manage refunds" ON public.refunds FOR ALL
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Testimonial images
CREATE POLICY "Staff manage testimonial images" ON public.testimonial_images FOR ALL
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

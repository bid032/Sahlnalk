-- =============================================================================
-- 08 -إصلاح تنبيهات Supabase Linter (Performance + Security)
-- شغّل الملف ده مرة واحدة من SQL Editor في مشروع Supabase بتاعك.
-- كل الأوامر آمنة وقابلة لإعادة التشغيل (idempotent).
-- =============================================================================

-- 1) Unindexed foreign keys ----------------------------------------------------
-- كل FK من غير index بيبطّئ الـ joins والحذف المتسلسل.
create index concurrently if not exists idx_account_inventory_delivered_order_item_id
  on public.account_inventory (delivered_order_item_id);

create index concurrently if not exists idx_coupon_redemptions_user_id
  on public.coupon_redemptions (user_id);

create index concurrently if not exists idx_coupons_created_by
  on public.coupons (created_by);

create index concurrently if not exists idx_delivered_accounts_delivered_by
  on public.delivered_accounts (delivered_by);

create index concurrently if not exists idx_order_items_plan_id
  on public.order_items (plan_id);

create index concurrently if not exists idx_order_items_product_id
  on public.order_items (product_id);

create index concurrently if not exists idx_orders_coupon_id
  on public.orders (coupon_id);

create index concurrently if not exists idx_refunds_created_by
  on public.refunds (created_by);

create index concurrently if not exists idx_refunds_user_id
  on public.refunds (user_id);

-- 2) Function search_path mutable (SECURITY) -----------------------------------
-- تثبيت search_path يمنع هجمات search_path hijacking.
alter function public.tg_prevent_frozen_unit_price_change() set search_path = public;
alter function public.tg_set_frozen_unit_price()            set search_path = public;
alter function public.tg_prevent_frozen_cost_change()       set search_path = public;
alter function public.update_inventory_plan_details()       set search_path = public;

-- 3) RLS enabled but no policy: public.notification_locks ----------------------
-- الجدول ده جدول داخلي (locks) بيتكتب من السيرفر فقط، فبنمنع الوصول من
-- anon/authenticated ونسيب service_role يشتغل عادي (بيتخطى RLS).
revoke all on public.notification_locks from anon, authenticated;
grant all on public.notification_locks to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_locks'
      and policyname = 'No client access to notification_locks'
  ) then
    create policy "No client access to notification_locks"
      on public.notification_locks
      for select
      to authenticated
      using (false);
  end if;
end $$;

-- 4) Unused indexes (اختياري) --------------------------------------------------
-- الاندكسات دي مش مستخدمة حسب الإحصائيات. سيبها مُعلَّقة لحد ما تتأكد إن
-- مفيش استعلام محتاجها، وبعدين شيل التعليق.
-- drop index concurrently if exists public.idx_audit_log_target;
-- drop index concurrently if exists public.products_category_ids_gin;

-- =============================================================================
-- ملاحظات لتنبيهات محتاجة قرار منك (متعملتش أوتوماتيك):
--
-- • auth_rls_initplan (55 تنبيه): استبدل auth.uid() بـ (select auth.uid())
--   جوّه تعريف كل policy. بيقلل إعادة التقييم لكل صف.
--
-- • multiple_permissive_policies (88 تنبيه): فيه أكتر من policy PERMISSIVE
--   لنفس الجدول/الدور/العملية، ادمجهم في policy واحدة بشرط OR.
--
-- • rls_policy_always_true على orders / order_items (INSERT):
--   الـ WITH CHECK (true) بتسمح لأي حد يدخل أوردر بأي user_id. الأفضل:
--   with check (user_id is null or user_id = (select auth.uid())).
--
-- • public_bucket_allows_listing على product-images / testimonial-images:
--   السياسة الحالية بتسمح بعرض قائمة كل الملفات. ضيّقها بـ prefix أو خلي
--   البكت private مع signed URLs لو الملفات مش لازم تكون عامة.
--
-- • auth_leaked_password_protection: فعّلها من Dashboard > Authentication.
-- =============================================================================

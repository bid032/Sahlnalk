-- ملف الإعدادات النهائية بعد بناء الجداول
-- شغّله في SQL Editor بعد ما تخلص من ملف 01_schema.sql

-- ============================================
-- 1. إعداد Storage Buckets
-- ============================================
insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('testimonial-images', 'testimonial-images', true),
  ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- ============================================
-- 2. تفعيل Realtime على الجداول المهمة
-- ============================================
begin;
  -- نضيف الجداول للـ publication (لو مش موجودة)
  alter publication supabase_realtime add table public.audit_log;
  alter publication supabase_realtime add table public.categories;
  alter publication supabase_realtime add table public.coupon_redemptions;
  alter publication supabase_realtime add table public.coupons;
  alter publication supabase_realtime add table public.delivered_accounts;
  alter publication supabase_realtime add table public.order_items;
  alter publication supabase_realtime add table public.orders;
  alter publication supabase_realtime add table public.plan_costs;
  alter publication supabase_realtime add table public.product_plans;
  alter publication supabase_realtime add table public.product_reviews;
  alter publication supabase_realtime add table public.products;
  alter publication supabase_realtime add table public.profiles;
  alter publication supabase_realtime add table public.refunds;
  alter publication supabase_realtime add table public.site_settings;
  alter publication supabase_realtime add table public.testimonial_images;
  alter publication supabase_realtime add table public.user_roles;
  alter publication supabase_realtime add table public.account_inventory;
commit;

-- ============================================
-- 3. ربط تريجر إنشاء البروفايل عند تسجيل مستخدم جديد
-- ============================================
-- أولاً نتأكد إن auth.users موجودة (بتكون موجودة تلقائي في أي مشروع Supabase)
-- ثم نربط التريجر

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- 4. تفعيل Email Provider في Auth (إعداد افتراضي)
-- ============================================
-- ملاحظة: الإعدادات دي بتكون موجودة افتراضياً، بس لو حبيت تتحكم فيها:
-- Authentication → Providers → Email
-- تأكد إن "Confirm email" مفعل لو عايز التأكيد بالإيميل.


WITH ai AS (SELECT id FROM public.categories WHERE slug='ai-tools'),
     ent AS (SELECT id FROM public.categories WHERE slug='entertainment'),
     dsg AS (SELECT id FROM public.categories WHERE slug='design')
INSERT INTO public.products (slug, name_ar, name_en, description_ar, description_en, category_id, delivery_type, account_type, status, is_featured, sort_order)
VALUES
  ('chatgpt-plus', 'ChatGPT Plus', 'ChatGPT Plus', 'وصول كامل إلى GPT-4o و DALL-E 3 و GPTs المخصصة. حساب خاص بالكامل بك.', 'Full access to GPT-4o, DALL-E 3, and Custom GPTs. Your own private login.', (SELECT id FROM ai), 'instant', 'private', 'active', true, 1),
  ('midjourney-pro', 'Midjourney Pro', 'Midjourney Pro', 'اشتراك شهر كامل في أفضل محرك توليد صور بالذكاء الاصطناعي. وصول مشترك.', 'Standard plan with fast generation hours. Shared professional profile access.', (SELECT id FROM ai), 'manual', 'shared', 'active', true, 2),
  ('netflix-premium', 'Netflix Premium 4K', 'Netflix Premium 4K', 'مشاهدة بجودة 4K UHD مع بروفايل خاص بك.', 'Watch in 4K UHD quality with your own profile.', (SELECT id FROM ent), 'instant', 'shared', 'active', true, 3),
  ('canva-pro', 'Canva Premium', 'Canva Premium', 'قوالب بريميوم وعناصر لا محدودة وأدوات فرق العمل.', 'Unlimited brand kits, premium elements, and templates. Valid for 1 year.', (SELECT id FROM dsg), 'instant', 'private', 'active', true, 4),
  ('spotify-premium', 'Spotify Premium', 'Spotify Premium', 'استمع بدون إعلانات وبجودة عالية.', 'Ad-free listening with high quality audio.', (SELECT id FROM ent), 'instant', 'shared', 'active', false, 5)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.product_plans (product_id, label_ar, label_en, duration_days, price, compare_price, stock, sort_order)
SELECT p.id, x.label_ar, x.label_en, x.dd, x.price, x.compare, x.stock, x.so
FROM public.products p
JOIN (VALUES
  ('chatgpt-plus', 'شهر واحد', '1 Month', 30, 750, 950, 20, 1),
  ('chatgpt-plus', '3 شهور', '3 Months', 90, 2000, 2850, 15, 2),
  ('midjourney-pro', 'شهري', 'Monthly', 30, 450, NULL, 10, 1),
  ('netflix-premium', 'شهر واحد', '1 Month', 30, 120, 180, 50, 1),
  ('netflix-premium', '3 شهور', '3 Months', 90, 320, NULL, 30, 2),
  ('canva-pro', 'سنوي', 'Annual', 365, 590, 890, 25, 1),
  ('spotify-premium', 'شهر واحد', '1 Month', 30, 45, 65, 40, 1)
) AS x(slug, label_ar, label_en, dd, price, compare, stock, so) ON x.slug = p.slug
ON CONFLICT DO NOTHING;


-- Wipe previous demo data
DELETE FROM public.product_plans;
DELETE FROM public.products;
DELETE FROM public.categories;

-- Categories
INSERT INTO public.categories (slug, name_ar, name_en, description_ar, description_en, icon, sort_order, is_active) VALUES
('design', 'أدوات المصممين', 'Design', 'اشتراكات لأدوات التصميم والمونتاج', 'Design & creative tools', '🎨', 1, true),
('ai-tools', 'أدوات الذكاء الاصطناعي', 'AI Tools', 'أفضل أدوات الذكاء الاصطناعي', 'Best AI tools & assistants', '🤖', 2, true),
('software', 'برامج أساسية', 'Software', 'برامج ويندوز والحماية والإنتاجية', 'Essential software & OS', '💻', 3, true),
('educational', 'تعليمية', 'Educational', 'منصات التعلم والكورسات', 'Learning & courses', '🎓', 4, true);

-- Products
WITH c AS (
  SELECT id, slug FROM public.categories
)
INSERT INTO public.products (category_id, slug, name_ar, name_en, description_ar, description_en, icon_url, delivery_type, account_type, status, is_featured, sort_order)
SELECT c.id, v.slug, v.name_ar, v.name_en, v.desc_ar, v.desc_en, v.icon, v.delivery::delivery_type, v.acc::account_type, 'active'::product_status, v.featured, v.sort
FROM c JOIN (VALUES
  -- Design
  ('design','figma','فيجما برو','Figma Pro','اشتراك Figma احترافي للتصاميم التعاونية','Professional Figma for collaborative UI/UX design','https://www.pixartprinting.it/blog/wp-content/uploads/2022/12/figma_logo.png','manual','private',true,1),
  ('design','adobe-creative-cloud','Adobe Creative Cloud','Adobe Creative Cloud','باقة أدوبي الكاملة لكل تطبيقات التصميم','Full Adobe suite: Photoshop, Illustrator, Premiere & more','https://upload.wikimedia.org/wikipedia/commons/4/4c/Adobe_Creative_Cloud_rainbow_icon.svg','manual','shared',true,2),
  ('design','capcut-pro','CapCut PRO','CapCut PRO','النسخة الاحترافية من CapCut للمونتاج','Pro CapCut for advanced video editing','https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/CapCut_logo.svg/3840px-CapCut_logo.svg.png','instant','shared',true,3),
  ('design','midjourney','Midjourney','Midjourney','توليد صور احترافية بالذكاء الاصطناعي','AI image generation, cinematic quality','https://www.furia.fi/wp-content/uploads/2023/08/Midjourney-logo-removebg-preview-1.png','manual','shared',true,4),
  ('design','envato','Envato Elements','Envato Elements','تحميل غير محدود من مكتبة Envato','Unlimited downloads from Envato library','https://cdn.worldvectorlogo.com/logos/envato.svg','manual','shared',false,5),
  ('design','motionarray','MotionArray','MotionArray','قوالب موشن جرافيك وفيديو','Motion & video templates','https://www.freelogovectors.net/wp-content/uploads/2022/06/motion-array-logo-freelogovectors.net_.png','manual','shared',false,6),
  ('design','magnific','Magnific AI','Magnific AI','رفع دقة وتحسين الصور بالذكاء الاصطناعي','AI image upscaler & enhancer','https://files.easy-orders.net/1772878044468764050.png','manual','private',false,7),
  ('design','higgsfield','Higgsfield AI','Higgsfield AI','فيديو سينمائي بالذكاء الاصطناعي','AI cinematic video generation','https://cdn.prod.website-files.com/6683d8c62e4e62685a8d91c8/68aeed5167eda64aa0ef6380_Higgsfield%20logo.webp','manual','private',false,8),
  ('design','canva-pro','Canva Pro','Canva Pro','كافا برو لتصاميم بسهولة','Canva Pro for effortless design','https://upload.wikimedia.org/wikipedia/en/thumb/b/bb/Canva_Logo.svg/1280px-Canva_Logo.svg.png','instant','shared',true,9),
  ('design','freepik','Freepik Premium','Freepik Premium','تحميل من Freepik بدون قيود','Unlimited Freepik downloads','https://vectorseek.com/wp-content/uploads/2023/09/Freepik-Logo-Vector.png','manual','shared',false,10),

  -- AI Tools
  ('ai-tools','chatgpt-plus','ChatGPT Plus','ChatGPT Plus','اشتراك ChatGPT Plus بنموذج GPT-5','ChatGPT Plus with GPT-5 & advanced features','https://freelogopng.com/images/all_img/1681038472chatgpt-logo.png','instant','private',true,1),
  ('ai-tools','google-gemini','Google AI - Gemini','Google AI - Gemini','اشتراك Gemini Advanced من جوجل','Gemini Advanced from Google','https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Google_Gemini_logo_2025.svg/3840px-Google_Gemini_logo_2025.svg.png','manual','shared',true,2),
  ('ai-tools','claude','Claude Pro','Claude Pro','اشتراك Claude Pro من Anthropic','Claude Pro from Anthropic','https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Claude_AI_logo.svg/3840px-Claude_AI_logo.svg.png','manual','shared',true,3),
  ('ai-tools','grok','Grok','Grok','اشتراك Grok من xAI','Grok subscription by xAI','https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Grok-feb-2025-logo.svg/3840px-Grok-feb-2025-logo.svg.png','manual','shared',false,4),
  ('ai-tools','perplexity','Perplexity Pro','Perplexity Pro','بحث ذكي بالذكاء الاصطناعي','AI-powered answer engine','https://edulab.vdu.lt/wp-content/uploads/2025/10/perplexity-ai-logo.png','manual','shared',false,5),
  ('ai-tools','kling','Kling AI','Kling AI','توليد فيديو بالذكاء الاصطناعي','AI video generation','https://files.easy-orders.net/1776174983120701203.png','manual','private',true,6),
  ('ai-tools','leonardo','Leonardo AI','Leonardo AI','توليد صور فنية بالذكاء الاصطناعي','AI art & image generation','https://neurotoolshq.com/wp-content/uploads/2025/07/Leonardo-AI-logo-2.jpg','manual','shared',false,7),
  ('ai-tools','krea','Krea AI','Krea AI','توليد صور وفيديو فوري','Real-time AI generation','https://www.searchyour.ai/archivos/krea-ai-logo.jpg','manual','shared',false,8),
  ('ai-tools','openart','OpenArt AI','OpenArt AI','منصة توليد صور بالذكاء الاصطناعي','AI image generation platform','https://cdn.prod.website-files.com/6600e1eab90de089c2d9c972/661592239b560b13e5156fa7_Logo_dark.svg','manual','shared',false,9),
  ('ai-tools','manus','Manus','Manus','وكيل ذكاء اصطناعي متكامل','Autonomous AI agent','https://upload.wikimedia.org/wikipedia/en/thumb/f/f7/Manus_logo.svg/330px-Manus_logo.svg.png','manual','private',false,10),
  ('ai-tools','heygen','HeyGen','HeyGen','فيديوهات AI مع أفاتار','AI avatar video generation','https://blog.syzgroup.com/hubfs/1_kDqT9RSUYnKEliiwyJwDcg.png','manual','shared',false,11),
  ('ai-tools','elevenlabs','ElevenLabs','ElevenLabs','توليد أصوات واقعية بالذكاء الاصطناعي','Realistic AI voice generation','https://images.g2crowd.com/uploads/product/image/social_landscape/social_landscape_b8c3daf65d785cff1c07ec2cb7c4205a/elevenlabsio.png','manual','shared',false,12),

  -- Software
  ('software','microsoft-office','Microsoft Office','Microsoft Office','ترخيص Microsoft Office أصلي مدى الحياة','Genuine lifetime Microsoft Office license','https://upload.wikimedia.org/wikipedia/commons/4/47/Microsoft_Office_13-16_Logo.png','instant','private',true,1),
  ('software','office-365-family','Office 365 Family','Office 365 Family','اشتراك Office 365 لعائلتك بالكامل','Office 365 subscription for the whole family','https://itnyou.fr/wp-content/uploads/2019/05/0-Logo-office-365.png','manual','shared',false,2),
  ('software','windows','Windows','Windows Pro','ترخيص أصلي لويندوز 10/11 Pro','Genuine Windows 10/11 Pro license','https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Windows_logo_-_2012.svg/250px-Windows_logo_-_2012.svg.png','instant','private',true,3),
  ('software','idm','Internet Download Manager','Internet Download Manager','ترخيص IDM أصلي','Genuine IDM license','https://upload.wikimedia.org/wikipedia/ar/9/95/%D8%B4%D8%B9%D8%A7%D8%B1_%D8%A5%D9%86%D8%AA%D8%B1%D9%86%D8%AA_%D8%AF%D8%A7%D9%88%D9%86%D9%84%D9%88%D8%AF_%D9%85%D8%A7%D9%86%D9%8A%D8%AC%D8%B1.png','instant','private',false,4),
  ('software','kaspersky','Kaspersky Premium','Kaspersky Premium','حماية كاملة من كاسبرسكي','Full protection by Kaspersky','https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Kaspersky_logo.svg/960px-Kaspersky_logo.svg.png','instant','private',false,5),

  -- Educational
  ('educational','coursera','Coursera Plus','Coursera Plus','وصول لكل كورسات Coursera','Access to all Coursera courses','https://mcl.edu.ph/wp-content/uploads/2024/07/I-ExCELL-Coursera-Logo-1-768x248.webp','manual','shared',true,1),
  ('educational','linkedin-premium','LinkedIn Premium','LinkedIn Premium','ميزات LinkedIn الاحترافية','LinkedIn Premium features','https://cdn.uconnectlabs.com/wp-content/uploads/sites/46/2022/08/Linkedin-Logo-e1660320077673.png','manual','shared',false,2)
) AS v(cat_slug, slug, name_ar, name_en, desc_ar, desc_en, icon, delivery, acc, featured, sort)
ON v.cat_slug = c.slug;

-- Plans (one month default; a few with 3-month options)
INSERT INTO public.product_plans (product_id, label_ar, label_en, duration_days, price, compare_price, stock, is_active, sort_order)
SELECT p.id, x.label_ar, x.label_en, x.days, x.price, x.compare, 999, true, x.sort
FROM public.products p JOIN (VALUES
  ('figma','شهر','1 Month',30,1100,1500,1),
  ('adobe-creative-cloud','شهر','1 Month',30,1700,4000,1),
  ('capcut-pro','شهر','1 Month',30,249,500,1),
  ('capcut-pro','3 شهور','3 Months',90,650,1500,2),
  ('midjourney','شهر','1 Month',30,340,400,1),
  ('midjourney','3 شهور','3 Months',90,950,1200,2),
  ('envato','شهر','1 Month',30,850,1000,1),
  ('motionarray','شهر','1 Month',30,399,450,1),
  ('magnific','شهر','1 Month',30,6100,8400,1),
  ('higgsfield','شهر','1 Month',30,2950,2950,1),
  ('canva-pro','سنة','1 Year',365,600,1200,1),
  ('freepik','شهر','1 Month',30,350,500,1),
  ('chatgpt-plus','شهر','1 Month',30,220,400,1),
  ('chatgpt-plus','3 شهور','3 Months',90,600,1200,2),
  ('google-gemini','شهر','1 Month',30,1100,1500,1),
  ('claude','شهر','1 Month',30,900,1200,1),
  ('grok','شهر','1 Month',30,700,1000,1),
  ('perplexity','سنة','1 Year',365,650,1500,1),
  ('kling','شهر','1 Month',30,1200,1500,1),
  ('leonardo','شهر','1 Month',30,350,400,1),
  ('krea','شهر','1 Month',30,650,700,1),
  ('openart','شهر','1 Month',30,499,700,1),
  ('manus','شهر','1 Month',30,550,700,1),
  ('heygen','شهر','1 Month',30,1500,2000,1),
  ('elevenlabs','شهر','1 Month',30,650,900,1),
  ('microsoft-office','مدى الحياة','Lifetime',3650,250,300,1),
  ('office-365-family','سنة','1 Year',365,699,900,1),
  ('windows','مدى الحياة','Lifetime',3650,250,400,1),
  ('idm','مدى الحياة','Lifetime',3650,1200,1500,1),
  ('kaspersky','سنة','1 Year',365,250,350,1),
  ('coursera','سنة','1 Year',365,1500,2500,1),
  ('linkedin-premium','شهر','1 Month',30,450,700,1)
) AS x(slug, label_ar, label_en, days, price, compare, sort)
ON x.slug = p.slug;

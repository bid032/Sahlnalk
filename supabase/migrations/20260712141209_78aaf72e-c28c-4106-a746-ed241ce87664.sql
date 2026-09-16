
UPDATE public.products SET
  description_ar = regexp_replace(description_ar, '[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F9FF]', '', 'g')
WHERE description_ar ~ '[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F9FF]';

UPDATE public.products SET description_ar = 'اشتراك Claude AI Pro -متاح بحساب خاص أو مشترك، تفعيل سريع ودعم كامل.'
WHERE id = '8f2c9e89-a053-49a5-a09b-040ebd8f3f9f';

UPDATE public.products SET description_ar = 'اشتراك Coursera Plus -وصول غير محدود لآلاف الكورسات والشهادات المعتمدة.'
WHERE id = '9c7355e3-1a25-48c4-b9b3-6f7ec21299bf';

UPDATE public.products SET description_ar = 'ترخيص Internet Download Manager أصلي مدى الحياة.'
WHERE id = '2c33bd11-1abd-40aa-a420-2ddfbf8f35e4';

UPDATE public.products SET description_ar = 'اشتراك Pacdora Pro -تصميم عبوات ثلاثية الأبعاد بحساب جاهز وتفعيل فوري.'
WHERE id = '7ed41e87-baed-488f-8b71-9d60adbdaa6b';

# ✅ قائمة الترحيل

اتبع الخطوات دي واحدة واحدة وعلّم ✓ على كل خطوة:

## التحضير
- [ ] فتحت Supabase project الجديد
- [ ] جبت Project URL
- [ ] جبت anon public key
- [ ] جبت service_role secret key
- [ ] جبت Database Connection string
- [ ] مليت ملف `migration/.env`

## الترحيل الآلي
- [ ] شغلت `npm install` في فولدر `migration`
- [ ] شغلت `npm run migrate`
- [ ] الترحيل اكتمل من غير أخطاء

## لو الترحيل الآلي فشل
- [ ] شغلت `01_schema.sql` في SQL Editor
- [ ] شغلت `02_data.sql` في SQL Editor
- [ ] شغلت `03_post_schema.sql` في SQL Editor

## بعد الترحيل
- [ ] عملت Storage buckets المطلوبة
- [ ] نقلت صور المنتجات للـ Storage الجديد
- [ ] حدّثت ملف `.env` في المشروع بالقيم الجديدة
- [ ] شغلت الموقع محلياً واختبرته
- [ ] جربت تسجيل دخول بحساب
- [ ] جربت فتح صفحة منتج

## قبل الرفع على الاستضافة
- [ ] تأكدت إن etohost.com تدعم Node.js
- [ ] رفعت الملفات وبنيت المشروع
- [ ] تأكدت إن الموقع شغال على الاستضافة

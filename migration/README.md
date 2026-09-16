# دليل الترحيل لـ Supabase الجديد

## قبل ما نبدأ

انت عندك دلوقتي 4 ملفات جاهزة في فولدر `migration`:

| الملف | الاستخدام |
|-------|-----------|
| `01_schema.sql` | بيعمل كل الجداول والدوال والصلاحيات في Supabase الجديد |
| `02_data.sql` | بينقل البيانات اللي موجودة دلوقتي (منتجات، طلبات، إلخ) |
| `03_post_schema.sql` | بيعمل Storage Buckets و Realtime و التريجرز النهائية |
| `migrate.mjs` | سكريبت آلي بينقل كل حاجة (المستخدمين + البيانات + الإعدادات) |

عندك طريقتين: **يدوية** أو **آلية**. لو مش فاهم التقنية، جرّب الطريقة اليدوية خطوة بخطوة.

---

## الطريقة الآلية (الأسهل لو عندك Node.js)

### الخطوة 1: جيب بيانات Supabase الجديد

1. ادخل على: https://supabase.com/dashboard
2. افتح المشروع الجديد.
3. من الشمال اضغط **Project Settings** (آيقونة الترس) → **API**.
4. انسخ القيم دي:
   - **Project URL**
   - **Project API keys → anon public**
   - **Project API keys → service_role secret**
5. من نفس الصفحة روح على **Database** وانسخ **Connection string**.

### الخطوة 2: املأ ملف .env

1. في فولدر `migration` اعمل نسخة من `.env.example` وسميها `.env`.
2. افتح `.env` بالـ Notepad.
3. الصق القيم اللي جبتها.

### الخطوة 3: شغّل الترحيل

1. افتح Terminal في فولدر `migration`.
2. لو أول مرة تشغل، اكتب:
   ```bash
   npm install
   ```
3. بعدين اكتب:
   ```bash
   npm run migrate
   ```

السكريبت هيعمل كل حاجة لوحده. لو ظهرت أي رسالة خطأ، صوّرها وابعتها لي.

> ⚠️ ملاحظة: المستخدمين هيتنقلوا بباسورد مؤقت. لازم يستخدموا "نسيت كلمة السر" في الموقع الجديد.

---

## الطريقة اليدوية

### الخطوة 1: افتح Supabase project الجديد

1. ادخل على: https://supabase.com/dashboard
2. افتح المشروع الجديد اللي عملته.

### الخطوة 2: جيب 3 حاجات من المشروع الجديد

من الشمال اضغط على **Project Settings** (آيقونة الترس)، بعدين من القائمة اختار **API**.

هتلاقي 3 حاجات محتاجينها:

1. **Project URL** -هيبقى شكله كده: `https://xxxxxxxx.supabase.co`
2. **Project API keys → anon public** -هيبقى شكله: `sb_publishable_...`
3. **Project API keys → service_role secret** -هيبقى شكله: `sb_secret_...`

انسخهم و احتفظ بيهم في ملف Notepad مؤقتاً.

> ⚠️ ماتشاركش الـ `service_role secret` مع حد. ده مفتاح الأدمن.

### الخطوة 3: شغّل ملف الـ Schema

1. من الشمال اضغط على **SQL Editor**.
2. اضغط **New query**.
3. افتح ملف `01_schema.sql` من فولدر `migration` (افتحه بـ Notepad أو أي محرر).
4. انسخ كل محتواه والصقه في SQL Editor.
5. اضغط **Run**.

لو ظهرت أي رسالة خضراء أو صفحة فاضية، يبقى كله تمام.

### الخطوة 4: شغّل ملف البيانات

نفس الخطوات السابقة بس للملف `02_data.sql`.

1. New query جديدة.
2. انسخ محتوى `02_data.sql` والصقه.
3. اضغط **Run**.

> ⚠️ ملاحظة: لو ظهر خطأ بخصوص `foreign key` أو `auth.users`، يبقى المستخدمين لسه ما اتنقلوش. لازم تنشئهم يدوياً في Authentication → Users أو تستخدم الطريقة الآلية.

### الخطوة 5: شغّل ملف الإعدادات النهائية

نفس الكلام للملف `03_post_schema.sql`.

### الخطوة 6: اعمل Storage Buckets

1. من الشمال اضغط **Storage**.
2. هتلاقي البوكتس اتعملت من الخطوة 5.
3. لو مش موجودة، اعملها يدوياً بالأسماء دي:
   - `product-images` (Public)
   - `testimonial-images` (Public)
   - `payment-proofs` (Private)

### الخطوة 7: نقل صور المنتجات (لو عايز تحافظ عليها)

الصور الموجودة في Lovable Cloud لازم تنقلها يدوياً:

1. من Lovable Cloud / Supabase الحالي: Storage → product-images → Download للصور.
2. في Supabase الجديد: Storage → product-images → Upload الصور بنفس الأسماء.

### الخطوة 8: حدّث بيانات الموقع

افتح ملف `.env` في المشروع (أو اعمله لو مش موجود) وحط القيم الجديدة:

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
VITE_SUPABASE_PROJECT_ID=xxxxxxxx

SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxx
SUPABASE_PROJECT_ID=xxxxxxxx
```

استبدل `xxxxxxxx` بالقيم اللي جبتها من الخطوة 2.

### الخطوة 9: اختبر الموقع

1. شغّل الموقع محلياً: `bun dev` (أو `npm run dev`).
2. جرب تفتح الصفحة الرئيسية وتشوف المنتجات ظاهرة ولا لأ.
3. جرب تسجيل دخول بحساب جديد.

---

## لو حصل مشكلة

### المشكلة: "relation already exists" أو "policy already exists"

ده معناه إنك شغّلت الملف أكتر من مرة. مش مشكلة، بس تأكد إن البيانات اتنقلت صح.

### المشكلة: "insert or update on table orders violates foreign key constraint orders_user_id_fkey"

ده معناه إن الطلبات بتشير لمستخدمين مش موجودين في auth.users. الحل:
- لو بتستخدم الطريقة الآلية: شغّل `npm run migrate` من الأول.
- لو يدوياً: روح Authentication → Users واعمل المستخدمين بالإيميلات الموجودة في الطلبات.

### المشكلة: الصور مش ظاهرة

لازم تنقل الصور يدوياً من الـ Storage القديم للجديد (الخطوة 7).

### المشكلة: الإيميلات مش بتوصل

في Supabase الجديد: Authentication → Providers → Email → شغّل **Confirm email** و **Secure email change** حسب اللي تحبيه.

---

## ملاحظة مهمة

الموقع الحالي مبني على **TanStack Start** وده محتاج Node.js server. الاستضافة اللي قولت عليها (`etohost.com`) غالباً بتدعم PHP بس. لازم تتأكد إنها تدعم:

- Node.js
- Vite build
- Static files + SSR

لو مش متأكد، اسأل دعم etohost قبل ما ترفع.

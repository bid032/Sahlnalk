import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Settings, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { pageDefaults } from "@/lib/page-defaults";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ImageUpload } from "@/components/ImageUpload";
import { AdminHero } from "@/components/AdminHero";
import { allProductsQuery } from "@/lib/home-queries";

const DEFAULT_HERO_SERVICES = [
  {
    id: "chatgpt",
    slug: "chatgpt-plus",
    name_ar: "ChatGPT Plus (GPT-4o)",
    name_en: "ChatGPT Plus (GPT-4o)",
    subtitle_ar: "أسرع طريقة للتفعيل على إيميلك الشخصي",
    originalPrice: "1,050 ج.م",
    price: 380,
    iconEmoji: "🤖",
    badge: "خصم 64%",
  },
  {
    id: "midjourney",
    slug: "midjourney-v6",
    name_ar: "Midjourney V6 Pro",
    name_en: "Midjourney V6 Pro",
    subtitle_ar: "توليد صور بجودة 8K بدون حدود",
    originalPrice: "1,550 ج.م",
    price: 420,
    iconEmoji: "🎨",
    badge: "توليد 8K",
  },
  {
    id: "canva",
    slug: "canva-pro",
    name_ar: "Canva Pro (حساب خاص)",
    name_en: "Canva Pro (Private Account)",
    subtitle_ar: "أدوات الذكاء الاصطناعي وتصميمات احترافية",
    originalPrice: "680 ج.م",
    price: 190,
    iconEmoji: "✨",
    badge: "وفر 72%",
  },
  {
    id: "adobe",
    slug: "adobe-creative-cloud",
    name_ar: "Adobe Creative Cloud",
    name_en: "Adobe Creative Cloud",
    subtitle_ar: "الحزمة الكاملة لأكثر من 20 تطبيق أصلي",
    originalPrice: "2,850 ج.م",
    price: 650,
    iconEmoji: "🚀",
    badge: "الحزمة الكاملة",
  },
  {
    id: "claude",
    slug: "claude-pro",
    name_ar: "Claude 3.5 Sonnet",
    name_en: "Claude 3.5 Sonnet",
    subtitle_ar: "أعلى دقة في البرمجة وتحليل البيانات",
    originalPrice: "1,050 ج.م",
    price: 390,
    iconEmoji: "🧠",
    badge: "للبرمجة والتحليل",
  },
];

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettings,
});

function AdminSettings() {
  const { t, lang, notify } = useApp();
  const qc = useQueryClient();
  const [brand, setBrand] = useState<any>({
    name_ar: "",
    name_en: "",
    tagline_ar: "",
    tagline_en: "",
    cover_url: "",
    avatar_url: "",
  });
  const [contact, setContact] = useState<any>({ whatsapp: "", telegram: "", email: "" });
  const [payments, setPayments] = useState<any>({
    paymob_enabled: true,
    kashier_enabled: true,
    manual_enabled: true,
  });
  const [manualPaymentDetails, setManualPaymentDetails] = useState<any>({
    instapay_number: "",
    wallet_number: "",
  });
  const [paypalEnabled, setPaypalEnabled] = useState<boolean>(true);
  const [paypalClientId, setPaypalClientId] = useState<string>("");
  const [paypalClientSecret, setPaypalClientSecret] = useState<string>("");
  const [paypalMode, setPaypalMode] = useState<"sandbox" | "live">("sandbox");
  const [usdRate, setUsdRate] = useState<number>(50);
  const [checkout, setCheckout] = useState<any>({ require_login: true });
  const [socials, setSocials] = useState<any>({
    facebook: "",
    instagram: "",
    tiktok: "",
    youtube: "",
    x: "",
    linkedin: "",
    discord: "",
  });
  // Site theme mode (original): both = visitor toggle, light/dark = locked.
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "both">("both");
  const [stats, setStats] = useState<any>({
    years: 3,
    staff: 5,
    services: 30,
    orders: 12000,
    customers: 2100,
  });
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [storedPassword, setStoredPassword] = useState<string>("");
  const [metaPixelId, setMetaPixelId] = useState("");
  const [metaCapiToken, setMetaCapiToken] = useState("");
  const [hero, setHero] = useState<any>({
    subtitle_ar: "",
    subtitle_en: "",
    services: DEFAULT_HERO_SERVICES,
  });

  const websiteProducts = useQuery(allProductsQuery());
  const productsList = websiteProducts.data ?? [];
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  const moveHeroService = (index: number, direction: "up" | "down") => {
    const list = [...(hero.services || DEFAULT_HERO_SERVICES)];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    setHero({ ...hero, services: list });
  };

  const updateHeroService = (index: number, field: string, value: any) => {
    const list = [...(hero.services || DEFAULT_HERO_SERVICES)];
    list[index] = { ...list[index], [field]: value };
    setHero({ ...hero, services: list });
  };

  const addWebsiteProductToHero = (productId?: string) => {
    const targetId = productId || selectedProductId;
    const prod = productsList.find((p) => p.id === targetId) || productsList[0];
    if (!prod) return;

    const list = [...(hero.services || DEFAULT_HERO_SERVICES)];
    const newItem = {
      id: prod.id,
      slug: prod.slug,
      name_ar: prod.name_ar,
      name_en: prod.name_en,
      subtitle_ar: "تفعيل فوري ورسمي 100%",
      originalPrice: prod.cheapestPlanComparePrice ? `${prod.cheapestPlanComparePrice} ج.م` : "",
      price: prod.minPrice ?? 0,
      iconUrl: prod.icon_url,
      iconEmoji: "⭐",
      badge: prod.discount_percent ? `خصم ${prod.discount_percent}%` : "مميز",
    };
    setHero({ ...hero, services: [...list, newItem] });
  };

  const bindServiceToProduct = (index: number, productId: string) => {
    const prod = productsList.find((p) => p.id === productId);
    if (!prod) return;

    const list = [...(hero.services || DEFAULT_HERO_SERVICES)];
    list[index] = {
      ...list[index],
      id: prod.id,
      slug: prod.slug,
      name_ar: prod.name_ar,
      name_en: prod.name_en,
      price: prod.minPrice ?? list[index].price,
      originalPrice: prod.cheapestPlanComparePrice ? `${prod.cheapestPlanComparePrice} ج.م` : list[index].originalPrice,
      iconUrl: prod.icon_url || list[index].iconUrl,
      badge: prod.discount_percent ? `خصم ${prod.discount_percent}%` : list[index].badge,
    };
    setHero({ ...hero, services: list });
  };

  const addHeroService = () => {
    if (productsList.length > 0) {
      addWebsiteProductToHero(productsList[0].id);
      return;
    }
    const list = [...(hero.services || DEFAULT_HERO_SERVICES)];
    const newItem = {
      id: `service_${Date.now()}`,
      slug: "new-service",
      name_ar: "خدمة جديدة",
      name_en: "New Service",
      subtitle_ar: "توصيف فوري للخدمة",
      originalPrice: "500 ج.م",
      price: 250,
      iconEmoji: "⭐",
      badge: "جديد",
    };
    setHero({ ...hero, services: [...list, newItem] });
  };

  const removeHeroService = (index: number) => {
    const list = [...(hero.services || DEFAULT_HERO_SERVICES)];
    list.splice(index, 1);
    setHero({ ...hero, services: list });
  };
  const [pageContent, setPageContent] = useState<Record<string, { ar: string; en: string }>>({
    shop_intro: { ar: "", en: "" },
    page_about: { ar: "", en: "" },
    page_terms: { ar: "", en: "" },
    page_refund: { ar: "", en: "" },
    page_privacy: { ar: "", en: "" },
  });

  const settings = useQuery({
    queryKey: ["site-settings"],
    queryFn: async () => (await supabase.from("site_settings").select("*")).data ?? [],
    // A background refetch must never race the form the admin is typing in.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // ---- Unsaved-edits guard -------------------------------------------------
  // `settings` is invalidated by realtime + by every save, so this effect used
  // to re-run while the admin was typing and silently reset the inputs back to
  // the values stored in the database (the "numbers revert after a few saves"
  // bug). We now only hydrate the form from the server while it is pristine:
  // a snapshot of the last hydrated values is compared with the current state.
  const formSnapshot = JSON.stringify({
    brand,
    contact,
    payments,
    manualPaymentDetails,
    checkout,
    socials,
    themeMode,
    stats,
    hero,
    pageContent,
    metaPixelId,
    metaCapiToken,
    paypalEnabled,
    paypalClientId,
    usdRate,
  });
  const hydratedSnapshot = useRef<string | null>(null);
  const justHydrated = useRef(false);
  // Timestamp of the last successful save. A refetch that lands within this
  // window is ignored so a lagging read never resurrects the old values.
  const savedAt = useRef(0);

  useEffect(() => {
    if (!justHydrated.current) return;
    justHydrated.current = false;
    hydratedSnapshot.current = formSnapshot;
  }, [formSnapshot]);

  useEffect(() => {
    if (!settings.data) return;
    // Pending local edits? keep them -never overwrite with server values.
    if (hydratedSnapshot.current !== null && hydratedSnapshot.current !== formSnapshot) return;
    if (Date.now() - savedAt.current < 8000) return;
    justHydrated.current = true;
    // إعداد القيم الافتراضية للأرقام
    let walletNumber = "";
    let instapayNumber = "";
    // Legacy blob kept separately: it is only a fallback for accounts that were
    // never migrated. Before this, a stale manual_payment_details row overwrote
    // the freshly saved wallet_number / instapay_number keys on every refetch,
    // which is exactly why edited numbers "came back" after saving.
    let legacyWallet = "";
    let legacyInstapay = "";

    for (const s of settings.data) {
      if (s.key === "brand") setBrand(s.value);
      if (s.key === "contact") setContact(s.value);
      if (s.key === "payments") {
        // إزالة instant_payment_enabled من الإعدادات القديمة
        const value = s.value as Record<string, any>;
        const { instant_payment_enabled, ...rest } = value;
        setPayments(rest);
      }
      // التعامل مع الأرقام الجديدة كمفاتيح فردية
      if (s.key === "wallet_number") walletNumber = String(s.value || "");
      if (s.key === "instapay_number") instapayNumber = String(s.value || "");
      if (s.key === "paypal_enabled") setPaypalEnabled(Boolean(s.value));
      if (s.key === "paypal_client_id") setPaypalClientId(String(s.value || ""));
      if (s.key === "paypal_client_secret") setPaypalClientSecret(String(s.value || ""));
      if (s.key === "paypal_mode")
        setPaypalMode(String(s.value || "") === "live" ? "live" : "sandbox");
      if (s.key === "usd_exchange_rate") setUsdRate(Number(s.value) || 50);
      // التعامل مع البيانات القديمة في حالة الترحيل
      if (
        s.key === "manual_payment_details" &&
        typeof s.value === "object" &&
        s.value !== null &&
        !Array.isArray(s.value)
      ) {
        const oldDetails = s.value as { wallet_number?: string; instapay_number?: string };
        legacyWallet = String(oldDetails.wallet_number || "");
        legacyInstapay = String(oldDetails.instapay_number || "");
      }
      if (s.key === "checkout") setCheckout((v: any) => ({ ...v, ...(s.value as any) }));
      if (s.key === "hero") setHero((h: any) => ({ ...h, ...(s.value as any) }));
      if (s.key === "socials") setSocials((v: any) => ({ ...v, ...(s.value as any) }));
      if (s.key === "stats") setStats((v: any) => ({ ...v, ...(s.value as any) }));
      if (s.key === "theme_mode") {
        const m = (s.value as any)?.mode;
        if (m === "light" || m === "dark" || m === "both") setThemeMode(m);
      }
      if (s.key === "meta_pixel_id") setMetaPixelId(String(s.value || ""));
      if (s.key === "meta_capi_token") setMetaCapiToken(String(s.value || ""));
      if (s.key === "admin_password") {
        // ما بنعرضهوش في الواجهة -بنستخدمه فقط للتحقق قبل التغيير
        setStoredPassword(typeof s.value === "string" ? s.value : String((s.value as any) ?? ""));
      }
      if (
        ["shop_intro", "page_about", "page_terms", "page_refund", "page_privacy"].includes(s.key)
      ) {
        setPageContent((prev) => ({
          ...prev,
          [s.key]: { ar: (s.value as any)?.ar ?? "", en: (s.value as any)?.en ?? "" },
        }));
      }
    }

    // تحديث حالة الأرقام بعد الانتهاء من الحلقة
    setManualPaymentDetails({
      wallet_number: walletNumber || legacyWallet,
      instapay_number: instapayNumber || legacyInstapay,
    });
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      // إعداد قائمة الإعدادات الأساسية
      const settingsToSave = [
        { key: "brand", value: brand },
        { key: "contact", value: contact },
        { key: "payments", value: payments },
        { key: "wallet_number", value: String(manualPaymentDetails.wallet_number ?? "").trim() },
        {
          key: "instapay_number",
          value: String(manualPaymentDetails.instapay_number ?? "").trim(),
        },
        { key: "paypal_enabled", value: paypalEnabled },
        { key: "paypal_client_id", value: paypalClientId.trim() },
        { key: "paypal_client_secret", value: paypalClientSecret.trim() },
        { key: "paypal_mode", value: paypalMode },
        { key: "usd_exchange_rate", value: Number(usdRate) || 50 },
        // Keep the legacy blob in sync -anything still reading it gets the
        // same numbers instead of a stale copy.
        {
          key: "manual_payment_details",
          value: {
            wallet_number: String(manualPaymentDetails.wallet_number ?? "").trim(),
            instapay_number: String(manualPaymentDetails.instapay_number ?? "").trim(),
          },
        },
        { key: "checkout", value: checkout },
        { key: "hero", value: hero },
        { key: "socials", value: socials },
        { key: "stats", value: stats },
        { key: "theme_mode", value: { mode: themeMode } },
        { key: "meta_pixel_id", value: metaPixelId.trim() },
        { key: "meta_capi_token", value: metaCapiToken.trim() },
        ...Object.entries(pageContent).map(([key, value]) => ({ key, value })),
      ];

      // تغيير باسورد الأمان: لازم الباسورد الحالي (لو موجود) + تأكيد مطابق
      if (adminPassword || confirmPassword || currentPassword) {
        if (!adminPassword || !confirmPassword) {
          throw new Error(
            lang === "ar" ? "اكتب الباسورد الجديد وأكّده" : "Enter and confirm the new password",
          );
        }
        if (adminPassword !== confirmPassword) {
          throw new Error(lang === "ar" ? "الباسورد غير متطابق" : "Passwords do not match");
        }
        if (adminPassword.length < 6) {
          throw new Error(
            lang === "ar"
              ? "الباسورد لازم 6 حروف على الأقل"
              : "Password must be at least 6 characters",
          );
        }
        if (storedPassword && currentPassword !== storedPassword) {
          throw new Error(
            lang === "ar" ? "الباسورد الحالي غير صحيح" : "Current password is incorrect",
          );
        }
        settingsToSave.push({ key: "admin_password", value: adminPassword });
      }

      // `onConflict: "key"` is explicit on purpose: without it PostgREST can
      // silently fall back to an INSERT that violates the primary key, so the
      // save appears to succeed while nothing changes in the database.
      const now = new Date().toISOString();
      const { error } = await supabase.from("site_settings").upsert(
        settingsToSave.map((s) => ({ ...s, updated_at: now })),
        { onConflict: "key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      // Refresh every cached read so the change is live everywhere at once.
      qc.invalidateQueries();
      // The saved values are now the source of truth: allow the next refetch to
      // re-hydrate the form (nothing is "unsaved" any more).
      savedAt.current = Date.now();
      hydratedSnapshot.current = null;
      justHydrated.current = true;
      settings.refetch();
      notify(lang === "ar" ? "تم حفظ الإعدادات" : "Settings saved", "success");
      // إعادة تعيين حقول الباسورد بعد الحفظ الناجح
      setAdminPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
    },
    onError: (e: any) =>
      notify(e?.message ?? (lang === "ar" ? "فشل الحفظ" : "Save failed"), "error"),
  });

  return (
    <div className="space-y-6">
      <AdminHero
        icon={Settings}
        title={t.admin.settings}
        subtitle={lang === "ar" ? "هوية المتجر والدفع والإشعارات" : "Brand, payments & notifications"}
      />

      <Section title={"Brand / الهوية"}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            placeholder="Name AR"
            value={brand.name_ar ?? ""}
            onChange={(e) => setBrand({ ...brand, name_ar: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded"
          />
          <input
            placeholder="Name EN"
            value={brand.name_en ?? ""}
            onChange={(e) => setBrand({ ...brand, name_en: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded"
          />
          <input
            placeholder="Tagline AR"
            value={brand.tagline_ar ?? ""}
            onChange={(e) => setBrand({ ...brand, tagline_ar: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded"
          />
          <input
            placeholder="Tagline EN"
            value={brand.tagline_en ?? ""}
            onChange={(e) => setBrand({ ...brand, tagline_en: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded"
          />
        </div>

        <div className="mt-5 p-4 rounded-2xl bg-card border border-border/80 space-y-4">
          <div>
            <h3 className="text-sm font-black text-brand mb-1">التحكم الكامل في الهيرو سيكشن (Hero Section Control)</h3>
            <p className="text-xs text-muted-foreground"></p>
          </div>

          {/* Badge Control */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">الوسام المضيء (Badge Strip)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                placeholder="⚡ اشتراكات أصلية بالجنيه المصري • تسليم فوري خلال دقائق"
                value={hero.badge_ar ?? ""}
                onChange={(e) => setHero({ ...hero, badge_ar: e.target.value })}
                className="px-3 py-2 bg-background border border-border rounded-xl text-xs"
                dir="rtl"
              />
              <input
                placeholder="⚡ Genuine subscriptions in EGP • Instant delivery"
                value={hero.badge_en ?? ""}
                onChange={(e) => setHero({ ...hero, badge_en: e.target.value })}
                className="px-3 py-2 bg-background border border-border rounded-xl text-xs"
              />
            </div>
          </div>

          {/* Title Control */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">العنوان الرئيسي للهيرو (Hero Main Title)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                placeholder="كل أدوات الذكاء الاصطناعي والتصميم... بين إيديك بأسعار مصرية!"
                value={hero.title_ar ?? ""}
                onChange={(e) => setHero({ ...hero, title_ar: e.target.value })}
                className="px-3 py-2 bg-background border border-border rounded-xl text-xs font-bold"
                dir="rtl"
              />
              <input
                placeholder="All AI & Design Tools... At Your Fingertips in EGP!"
                value={hero.title_en ?? ""}
                onChange={(e) => setHero({ ...hero, title_en: e.target.value })}
                className="px-3 py-2 bg-background border border-border rounded-xl text-xs font-bold"
              />
            </div>
          </div>

          {/* Subtitle / Bio */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">الوصف التفصيلي (Hero Subtitle)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <textarea
                  placeholder="وفر حتى 70% على اشتراكات ChatGPT Plus و Midjourney و Canva Pro..."
                  value={hero.subtitle_ar ?? ""}
                  onChange={(e: any) => setHero({ ...hero, subtitle_ar: e.target.value })}
                  className="px-3 py-2 bg-background border border-border rounded-xl outline-none transition focus:border-brand text-xs"
                  dir="rtl"
                  rows={2}
                />
              </div>
              <div className="flex flex-col gap-1">
                <textarea
                  placeholder="Save up to 70% on ChatGPT Plus, Midjourney & Canva Pro..."
                  value={hero.subtitle_en ?? ""}
                  onChange={(e: any) => setHero({ ...hero, subtitle_en: e.target.value })}
                  className="px-3 py-2 bg-background border border-border rounded-xl outline-none transition focus:border-brand text-xs"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Hero Services Cards Manager */}
          <div className="pt-4 border-t border-border/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black text-brand">خدمات الهيرو سيكشن (Hero Section Services)</h4>
                <p className="text-[11px] text-muted-foreground"></p>
              </div>
            </div>

            {/* Clean Vertically Stacked List */}
            <div className="space-y-2 mt-2">
              {(hero.services || DEFAULT_HERO_SERVICES).map((service: any, index: number) => {
                const total = (hero.services || DEFAULT_HERO_SERVICES).length;
                const matchedProduct = productsList.find((p) => p.slug === service.slug || p.id === service.id);

                return (
                  <div
                    key={service.id || index}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-background border border-border/90 hover:border-brand/40 transition shadow-2xs"
                  >
                    <span className="grid size-7 place-items-center rounded-lg bg-brand/10 text-xs font-bold text-brand shrink-0">
                      #{index + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <select
                        value={matchedProduct?.id || service.id || ""}
                        onChange={(e) => bindServiceToProduct(index, e.target.value)}
                        className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-foreground outline-none focus:border-brand"
                        dir="rtl"
                      >
                        <option value="">-- اختر المنتج من المتجر --</option>
                        {productsList.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name_ar || p.name_en} ({p.minPrice ?? "0"} ج.م)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Move Up */}
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveHeroService(index, "up")}
                        className="p-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title="تحريك لأعلى"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      {/* Move Down */}
                      <button
                        type="button"
                        disabled={index === total - 1}
                        onClick={() => moveHeroService(index, "down")}
                        className="p-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title="تحريك لأسفل"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <div className="space-y-1.5 max-w-md">
            <label className="text-xs font-bold text-foreground">
              الصورة الشخصية (Avatar) للصفحة الرئيسية
            </label>
            <ImageUpload
              bucket="product-images"
              label=""
              compact
              value={brand.avatar_url ?? ""}
              onChange={(url) => setBrand({ ...brand, avatar_url: url })}
              size={0}
              requireAspectRatio={{ w: 1, h: 1 }}
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              لو فاضية هتظهر الصورة الافتراضية.
            </p>
          </div>
        </div>
      </Section>

      <Section title={"إعدادات الشراء"}>
        <p className="text-xs text-muted-foreground mb-4"></p>
        <label className="flex items-start gap-3 p-4 bg-background border border-border rounded-xl cursor-pointer">
          <input
            type="checkbox"
            checked={checkout.require_login ?? true}
            onChange={(e) => setCheckout({ ...checkout, require_login: e.target.checked })}
            className="mt-1"
          />
          <div>
            <div className="font-bold">إجبار العميل على تسجيل الدخول قبل الشراء</div>
            <div className="text-xs text-muted-foreground mt-1">
              لو مفعّل: العميل لازم يعمل تسجيل دخول علشان يكمل الشراء.
              <br />
              لو مقفول: العميل يقدر يشتري كضيف (بس هيدخل إيميل وموبايل).
            </div>
          </div>
        </label>
      </Section>

      <Section title={"الدفع اليدوي"}>
        <p className="text-xs text-muted-foreground mb-4"></p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(
            [
              [
                "wallet_number",
                "رقم المحفظة الإلكترونية",
                "فودافون كاش / اتصالات / أورنج",
                "01xxxxxxxxx",
                "📱",
              ],
              ["instapay_number", "رقم أو عنوان InstaPay", "InstaPay", "01xxxxxxxxx", "🏦"],
            ] as const
          ).map(([k, title, hint, ph, icon]) => {
            const val = (manualPaymentDetails as any)[k] ?? "";
            return (
              <div key={k} className="p-4 rounded-2xl bg-background border border-border space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 grid place-items-center rounded-xl bg-brand/10 text-base">
                    {icon}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{hint}</div>
                  </div>
                </div>
                <input
                  dir="ltr"
                  inputMode="tel"
                  placeholder={ph}
                  value={val}
                  onChange={(e) =>
                    setManualPaymentDetails((prev: any) => ({
                      ...prev,
                      [k]: e.target.value.replace(/[^\d+]/g, ""),
                    }))
                  }
                  className="w-full px-3 py-2.5 bg-card border border-border rounded-xl font-mono tracking-wider focus:outline-none focus:border-brand"
                />
                <div className="text-[11px] text-muted-foreground">
                  {val ? (
                    <>
                      هيظهر للعميل: <b className="text-foreground font-mono">{val}</b>
                    </>
                  ) : (
                    "الخانة فاضية -مش هتظهر للعميل."
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={"إعدادات PayPal وسعر صرف الدولار"}>
        <p className="text-xs text-muted-foreground mb-4"></p>
        <div className="space-y-4">
          <label className="flex items-start gap-3 p-4 bg-background border border-border rounded-2xl cursor-pointer hover:border-brand/40 transition">
            <input
              type="checkbox"
              checked={paypalEnabled}
              onChange={(e) => setPaypalEnabled(e.target.checked)}
              className="mt-1 accent-brand shrink-0 size-4"
            />
            <div>
              <div className="font-bold text-sm">تفعيل طريقة الدفع عبر PayPal في صفحة الشراء</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                عند تفعيل الخيار، سيظهر زر PayPal للعملاء ضمن خيارات الدفع المتاحة لتمكين الدفع
                الفوري بالبطاقات البانكية والحسابات.
              </div>
            </div>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-background border border-border space-y-2">
              <label className="text-[11px] font-bold text-muted-foreground block">
                سعر صرف 1 دولار (USD) بالجنيه المصري (EGP)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={usdRate}
                  onChange={(e) => setUsdRate(Math.max(1, Number(e.target.value) || 50))}
                  className="w-full px-3 py-2.5 bg-card border border-border rounded-xl font-bold text-sm focus:outline-none focus:border-brand"
                  dir="ltr"
                />
                <span className="text-xs font-bold text-muted-foreground shrink-0">ج.م / $</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                يُستخدم لتحويل مبلغ الطلب بالجنيه المصري إلى الدولار للخصم عبر بايبال (مثال: 500 ج.م
                ÷ {usdRate} = ${(500 / (usdRate || 50)).toFixed(2)} USD).
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-background border border-border space-y-2">
              <label className="text-[11px] font-bold text-muted-foreground block">
                PayPal Client ID (معرّف تطبيق بايبال)
              </label>
              <input
                type="text"
                dir="ltr"
                value={paypalClientId}
                onChange={(e) => setPaypalClientId(e.target.value)}
                placeholder="Client ID من developer.paypal.com"
                className="w-full px-3 py-2.5 bg-card border border-border rounded-xl font-mono text-sm focus:outline-none focus:border-brand"
              />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                الـ Client ID الخاص بحسابك من موقع المطورين لبايبال.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-background border border-border space-y-2">
              <label className="text-[11px] font-bold text-muted-foreground block">
                PayPal Client Secret (المفتاح السري -سيرفر فقط)
              </label>
              <input
                type="password"
                dir="ltr"
                value={paypalClientSecret}
                onChange={(e) => setPaypalClientSecret(e.target.value)}
                placeholder="Secret Key من developer.paypal.com"
                className="w-full px-3 py-2.5 bg-card border border-border rounded-xl font-mono text-sm focus:outline-none focus:border-brand"
              />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                يُحفظ في السيرفر فقط للتحقق الآمن من عملية الخصم وتأكيد الطلبات.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-background border border-border space-y-2">
              <label className="text-[11px] font-bold text-muted-foreground block">
                بيئة العمل (Environment Mode)
              </label>
              <select
                value={paypalMode}
                onChange={(e) => setPaypalMode(e.target.value as "sandbox" | "live")}
                className="w-full px-3 py-2.5 bg-card border border-border rounded-xl font-bold text-sm focus:outline-none focus:border-brand"
              >
                <option value="sandbox">Sandbox (بيئة الاختبار والتجربة)</option>
                <option value="live">Live (بيئة العمل الفعلية والأموال الحقيقية)</option>
              </select>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                اختر Sandbox للتجربة أو Live عند إطلاق الموقع لاستقبال الأموال الحقيقية.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section title={"إعدادات الأمان"}>
        <p className="text-xs text-muted-foreground mb-4"></p>
        <div className="max-w-xl p-4 rounded-2xl bg-background border border-border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 grid place-items-center rounded-xl bg-brand/10">🔒</span>
              <div>
                <div className="font-bold text-sm">باسورد العمليات الحساسة</div>
                <div className="text-[11px] text-muted-foreground">
                  {storedPassword ? "متعيّن حالياً -لازم الباسورد الحالي للتغيير" : "لسه مش متعيّن"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-[11px] font-bold text-brand hover:underline shrink-0"
            >
              {showPassword ? "إخفاء" : "إظهار"}
            </button>
          </div>

          <div className="space-y-3">
            {storedPassword && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  الباسورد الحالي
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="الباسورد المستخدم حالياً"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="px-3 py-2.5 bg-card border border-border rounded-xl focus:outline-none focus:border-brand"
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  الباسورد الجديد
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="6 حروف على الأقل"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="px-3 py-2.5 bg-card border border-border rounded-xl focus:outline-none focus:border-brand"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  تأكيد الباسورد الجديد
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="أعد إدخال الباسورد"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="px-3 py-2.5 bg-card border border-border rounded-xl focus:outline-none focus:border-brand"
                />
              </div>
            </div>
          </div>

          {adminPassword && confirmPassword && adminPassword !== confirmPassword && (
            <p className="text-xs text-destructive">الباسورد غير متطابق</p>
          )}
          {adminPassword && adminPassword.length < 6 && (
            <p className="text-xs text-warning">الباسورد قصير -لازم 6 حروف على الأقل</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            سيب الخانات فاضية لو مش عايز تغيّر الباسورد -الحفظ مش هيلمسه.
          </p>
        </div>
      </Section>

      <Section title={"Meta (Facebook) Pixel & Conversions API (CAPI)"}>
        <p className="text-xs text-muted-foreground mb-4"></p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-background border border-border space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground block">
              Meta Pixel ID / المعرّف
            </label>
            <input
              type="text"
              dir="ltr"
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value)}
              placeholder="مثال: 123456789012345"
              className="w-full px-3 py-2 bg-card border border-border rounded-xl font-mono text-sm focus:outline-none focus:border-brand"
            />
            <p className="text-[10px] text-muted-foreground">
              الرمز الحالي المستخدم لتسجيل الأحداث تلقائياً في المتصفح.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-background border border-border space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground block">
              Conversions API Token (اختياري)
            </label>
            <input
              type="password"
              dir="ltr"
              value={metaCapiToken}
              onChange={(e) => setMetaCapiToken(e.target.value)}
              placeholder="EAA..."
              className="w-full px-3 py-2 bg-card border border-border rounded-xl font-mono text-sm focus:outline-none focus:border-brand"
            />
            <p className="text-[10px] text-muted-foreground">
              توكن CAPI لإرسال أحداث الشراء من السيرفر مباشرة لتفادي محجبات الإعلانات (AdBlock).
            </p>
          </div>
        </div>
      </Section>

      <Section title={"التواصل / Contact & Social"}>
        <h3 className="text-sm font-extrabold mb-3">بيانات التواصل المباشر</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <input
            placeholder="WhatsApp"
            value={contact.whatsapp ?? ""}
            onChange={(e) => setContact({ ...contact, whatsapp: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded"
            dir="ltr"
          />
          <input
            placeholder="Telegram"
            value={contact.telegram ?? ""}
            onChange={(e) => setContact({ ...contact, telegram: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded"
            dir="ltr"
          />
          <input
            placeholder="Email"
            value={contact.email ?? ""}
            onChange={(e) => setContact({ ...contact, email: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded"
            dir="ltr"
          />
        </div>

        <h3 className="text-sm font-extrabold mb-1">حسابات السوشيال</h3>
        <p className="text-xs text-muted-foreground mb-4">
          حط اللينك كامل (https://...). الخانات الفاضية مش هتظهر في الفوتر.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              ["facebook", "Facebook URL"],
              ["instagram", "Instagram URL"],
              ["tiktok", "TikTok URL"],
              ["youtube", "YouTube URL"],
              ["x", "X (Twitter) URL"],
              ["linkedin", "LinkedIn URL"],
              ["discord", "Discord Invite URL"],
            ] as const
          ).map(([k, ph]) => (
            <input
              key={k}
              placeholder={ph}
              value={socials[k] ?? ""}
              onChange={(e) => setSocials({ ...socials, [k]: e.target.value })}
              className="px-3 py-2 bg-background border border-border rounded"
              dir="ltr"
            />
          ))}
        </div>
      </Section>

      <Section title={"Trust Stats / أرقام الثقة"}>
        <p className="text-xs text-muted-foreground mb-4"></p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {(
            [
              ["years", "سنين خبرة", "📅"],
              ["staff", "موظفين دعم", "🎧"],
              ["services", "خدمات", "🧩"],
              ["orders", "عمليات شراء", "🛒"],
              ["customers", "عملاء", "👥"],
            ] as const
          ).map(([k, label, icon]) => (
            <div
              key={k}
              className="p-3 rounded-2xl bg-background border border-border text-center space-y-2"
            >
              <div className="w-9 h-9 mx-auto grid place-items-center rounded-xl bg-brand/10">
                {icon}
              </div>
              <label className="block text-[11px] font-bold text-muted-foreground">{label}</label>
              <input
                type="number"
                min={0}
                value={stats[k] ?? 0}
                onChange={(e) =>
                  setStats({ ...stats, [k]: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-full px-2 py-2 bg-card border border-border rounded-xl text-center font-black text-lg focus:outline-none focus:border-brand"
                dir="ltr"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title={"محتوى الصفحات / Page Content"}>
        <div className="mb-4 rounded-xl border border-brand/30 bg-brand/5 p-3 text-xs leading-relaxed space-y-1">
          <p className="font-bold text-brand">👇 تحكم كامل في نصوص الصفحات</p>
          <p className="text-muted-foreground">
            كل خانة هنا بتتحكم في محتوى صفحة كاملة أو قسم منها. الشكل الجديد:
          </p>
          <ul className="text-muted-foreground list-disc list-inside space-y-0.5 ps-2">
            <li>
              لو الخانة <b>فاضية</b> ← بيتم عرض النص الافتراضي الظاهر تحتها (اللي بيبان دلوقتي على
              الموقع).
            </li>
            <li>
              لو <b>ملأتها</b> ← النص اللي بتكتبه هيستبدل المحتوى الافتراضي بالكامل في الصفحة دي.
            </li>
            <li>ينفع تكتب أكتر من فقرة (اضغط Enter عشان تنزل سطر).</li>
          </ul>
        </div>
        <div className="space-y-6">
          {(
            [
              [
                "shop_intro",
                'مقدمة صفحة المتجر (تحت "كل الخدمات")',
                'Shop page intro (under "All services")',
              ],
              ["page_about", 'صفحة "من نحن" بالكامل', "About page (full replace)"],
              ["page_terms", "صفحة الشروط والأحكام بالكامل", "Terms page (full replace)"],
              [
                "page_refund",
                "قسم الاسترداد في صفحة (الاسترداد والخصوصية)",
                "Refund section in Refund & Privacy page",
              ],
              [
                "page_privacy",
                "قسم الخصوصية في صفحة (الاسترداد والخصوصية)",
                "Privacy section in Refund & Privacy page",
              ],
            ] as const
          ).map(([key, labelAr, labelEn]) => {
            const defAr = pageDefaults[key]("ar");
            const defEn = pageDefaults[key]("en");
            const valAr = pageContent[key]?.ar ?? "";
            const valEn = pageContent[key]?.en ?? "";
            const usingCustomAr = valAr.trim().length > 0;
            const usingCustomEn = valEn.trim().length > 0;
            return (
              <details
                key={key}
                className="rounded-2xl bg-background/60 border border-border overflow-hidden [&[open]>summary_.chev]:rotate-180"
              >
                <summary className="list-none cursor-pointer select-none flex items-center gap-3 p-4 hover:bg-muted/30 transition">
                  <span className="w-8 h-8 shrink-0 grid place-items-center rounded-xl bg-brand/10 text-xs">
                    📄
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-sm truncate">{labelAr}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {labelEn}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${usingCustomAr || usingCustomEn ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"}`}
                  >
                    {usingCustomAr || usingCustomEn ? "مخصص ✓" : "افتراضي"}
                  </span>
                  <svg
                    className="chev shrink-0 w-4 h-4 text-muted-foreground transition-transform"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pt-0 border-t border-border">
                  {/* Arabic */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-muted-foreground">
                        النص بالعربي
                      </label>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${usingCustomAr ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"}`}
                      >
                        {usingCustomAr ? "نص مخصص ✓" : "افتراضي"}
                      </span>
                    </div>
                    <RichTextEditor
                      value={valAr}
                      onChange={(v) =>
                        setPageContent({ ...pageContent, [key]: { ...pageContent[key], ar: v } })
                      }
                      dir="rtl"
                      lang="ar"
                      minHeight={180}
                      placeholder="اسيبها فاضية عشان تفضل النص الافتراضي..."
                    />

                    <details className="mt-1 group">
                      <summary className="cursor-pointer text-[10px] font-bold text-muted-foreground hover:text-brand select-none">
                        عرض النص الافتراضي الظاهر حالياً ▾
                      </summary>
                      <pre
                        dir="rtl"
                        className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed p-2 bg-muted/40 border border-border rounded text-muted-foreground font-sans text-end"
                      >
                        {defAr}
                      </pre>
                      <button
                        type="button"
                        onClick={() =>
                          setPageContent({
                            ...pageContent,
                            [key]: { ...pageContent[key], ar: defAr },
                          })
                        }
                        className="mt-1 text-[10px] font-bold text-brand hover:underline"
                      >
                        نسخ الافتراضي للخانة عشان أعدّل عليه
                      </button>
                    </details>
                  </div>
                  {/* English */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-muted-foreground">
                        English text
                      </label>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${usingCustomEn ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"}`}
                      >
                        {usingCustomEn ? "Custom ✓" : "Default"}
                      </span>
                    </div>
                    <RichTextEditor
                      value={valEn}
                      onChange={(v) =>
                        setPageContent({ ...pageContent, [key]: { ...pageContent[key], en: v } })
                      }
                      dir="ltr"
                      lang="en"
                      minHeight={180}
                      placeholder="Leave empty to keep the default text..."
                    />

                    <details className="mt-1 group">
                      <summary className="cursor-pointer text-[10px] font-bold text-muted-foreground hover:text-brand select-none">
                        Show default text currently shown ▾
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed p-2 bg-muted/40 border border-border rounded text-muted-foreground font-sans">
                        {defEn}
                      </pre>
                      <button
                        type="button"
                        onClick={() =>
                          setPageContent({
                            ...pageContent,
                            [key]: { ...pageContent[key], en: defEn },
                          })
                        }
                        className="mt-1 text-[10px] font-bold text-brand hover:underline"
                      >
                        Copy default into the field to edit it
                      </button>
                    </details>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </Section>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="px-6 py-3 bg-brand text-brand-foreground rounded-lg font-bold hover:brand-glow"
      >
        {save.isPending ? t.common.loading : t.admin.save}
      </button>
    </div>
  );
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group bg-card border border-border rounded-2xl overflow-hidden [&[open]>summary_.chev]:rotate-180"
    >
      <summary className="list-none cursor-pointer select-none flex items-center justify-between gap-3 p-4 sm:p-5 hover:bg-muted/40 transition">
        <h2 className="font-bold text-sm sm:text-base min-w-0 truncate">{title}</h2>
        <svg
          className="chev shrink-0 w-4 h-4 text-muted-foreground transition-transform"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="p-4 sm:p-6 pt-0 sm:pt-0 border-t border-border">{children}</div>
    </details>
  );
}

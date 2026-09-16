import { createFileRoute, useNavigate, notFound } from "@tanstack/react-router";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Copy,
  ShoppingCart,
  Star,
  Store,
  TicketPercent,
  Truck,
  Zap,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Link } from "@tanstack/react-router";
import {
  ProductDelivery,
  ProductDescription,
  ProductPolicy,
  ProductReviews,
  useProductReviews,
  type ProductReviewRow,
} from "@/components/ProductTabs";
import { ProductCard, type ProductCardData } from "@/components/ProductCard";
import { InlineMarkdown } from "@/components/MarkdownContent";
import { PricingConfigurator } from "@/components/PricingConfigurator";
import { SiteButton } from "@/components/ui/site-button";
import { useApp } from "@/contexts/AppContext";
import { useSiteSetting } from "@/hooks/useSiteSetting";
import { stripMd } from "@/lib/strip-md";
import { clearPendingCoupon, setPendingCoupon } from "@/lib/coupon-storage";
import { supabase } from "@/integrations/supabase/client";
import { trackViewContent } from "@/lib/meta-pixel";

import { queryOptions } from "@tanstack/react-query";

export const productDetailQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "*, product_plans(id, price, compare_price, is_active, label_ar, label_en, stock, duration_days, account_type, plan_variant)",
        )
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ params, context }) => {
    const qc = (context as any)?.queryClient;
    let product: any = null;
    try {
      if (qc) {
        product = await qc.ensureQueryData(productDetailQuery(params.slug));
      }
    } catch { }

    if (!product) {
      const { data } = await supabase
        .from("products")
        .select(
          "*, product_plans(id, price, compare_price, is_active, label_ar, label_en, stock, duration_days, account_type, plan_variant)",
        )
        .eq("slug", params.slug)
        .eq("status", "active")
        .maybeSingle();
      product = data;
    }

    if (!product) throw notFound();

    const active = (product.product_plans ?? []).filter((p: any) => p.is_active);
    const cheapest = active.sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];

    let reviewRows: { id: string; reviewer_name: string; rating: number; body: string }[] = [];
    try {
      const { data: reviews } = await supabase
        .from("product_reviews")
        .select("id, reviewer_name, rating, body")
        .eq("product_id", product.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(20);
      reviewRows = (reviews ?? []) as typeof reviewRows;
    } catch { }

    const reviewCount = reviewRows.length;
    const reviewAvg =
      reviewCount > 0
        ? Math.round(
          (reviewRows.reduce((s, r) => s + Number(r.rating ?? 0), 0) / reviewCount) * 10,
        ) / 10
        : 0;

    return {
      product,
      slug: product.slug,
      name_ar: product.name_ar,
      name_en: product.name_en,
      short_description_ar: product.short_description_ar ?? null,
      short_description_en: product.short_description_en ?? null,
      description_ar: product.description_ar,
      description_en: product.description_en,
      icon_url: product.icon_url,
      minPrice: cheapest ? Number(cheapest.price) : null,
      reviewStats: { count: reviewCount, avg: reviewAvg },
      reviewSeed: reviewRows,
    };
  },
  head: ({ params, loaderData }) => {
    const p = loaderData;
    if (!p) {
      return {
        meta: [{ title: "المنتج غير موجود، سهلنالك" }, { name: "robots", content: "noindex" }],
      };
    }
    const name = p.name_ar || p.name_en;
    const nameEn = p.name_en || p.name_ar;
    const desc = stripMd(
      p.description_ar ||
      p.description_en ||
      `${name} الأصلي بالجنيه من سهلنالك - يوصلك في دقائق ومعاه ضمان حقيقي.`,
    ).slice(0, 160);
    const title = `${name} | اشتراك أصلي - سهلنالك`;
    const fullUrl = `https://rapidkeyz.com/product/${params.slug}`;
    const rawIcon = p.icon_url?.trim();
    const imageUrl = rawIcon
      ? rawIcon.startsWith("http://") || rawIcon.startsWith("https://")
        ? rawIcon
        : `https://rapidkeyz.com${rawIcon.startsWith("/") ? "" : "/"}${rawIcon}`
      : "https://rapidkeyz.com/cover.webp";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:site_name", content: "Sahlnalk" },
        { property: "og:title", content: `${name} | Sahlnalk` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:url", content: fullUrl },
        { property: "og:image", content: imageUrl },
        { property: "og:image:secure_url", content: imageUrl },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: `${name} | Sahlnalk` },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: imageUrl },
      ],
      links: [{ rel: "canonical", href: fullUrl }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: nameEn,
            description: p.description_en || p.description_ar || undefined,
            image: p.icon_url || undefined,
            brand: { "@type": "Brand", name: "Sahlnalk" },
            offers: p.minPrice
              ? {
                "@type": "Offer",
                price: p.minPrice,
                priceCurrency: "EGP",
                availability: "https://schema.org/InStock",
                url: fullUrl,
              }
              : undefined,
            aggregateRating:
              (p as any).reviewStats?.count > 0
                ? {
                  "@type": "AggregateRating",
                  ratingValue: (p as any).reviewStats.avg,
                  reviewCount: (p as any).reviewStats.count,
                }
                : undefined,
            review:
              Array.isArray((p as any).reviewSeed) && (p as any).reviewSeed.length > 0
                ? (p as any).reviewSeed.slice(0, 5).map((r: any) => ({
                  "@type": "Review",
                  author: { "@type": "Person", name: r.reviewer_name || "Customer" },
                  reviewRating: {
                    "@type": "Rating",
                    ratingValue: Number(r.rating ?? 5),
                    bestRating: 5,
                  },
                  reviewBody: stripMd(String(r.body ?? "")).slice(0, 500),
                }))
                : undefined,
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "/" },
              { "@type": "ListItem", position: 2, name: "Shop", item: "/shop" },
              { "@type": "ListItem", position: 3, name: nameEn, item: fullUrl },
            ],
          }),
        },
      ],
    };
  },
  component: ProductPage,
  notFoundComponent: () => <ProductMissing />,
});

function ProductMissing() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <div className="flex-1 grid place-items-center px-6 py-24 text-center">
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">المنتج غير موجود</h1>
          <p className="text-muted-foreground">الرابط غير صحيح أو تم إيقاف هذا المنتج.</p>
          <Link
            to="/shop"
            className="inline-block rounded-lg bg-primary px-6 py-3 text-primary-foreground"
          >
            تصفّح كل الخدمات
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}

type ProfileTab = "plans" | "description" | "reviews" | "delivery";

function ProductPage() {
  const { slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const { t, lang, addToCart } = useApp();
  const notify = (useApp() as any)?.notify as ((msg: string, kind?: string) => void) | undefined;
  const navigate = useNavigate();
  // keepPreviousData: navigating slug A → B keeps A's page fully visible
  // while B loads in the background — no skeleton repaint, no blank flash.
  const { data: product, isLoading } = useQuery({
    ...productDetailQuery(slug),
    initialData: loaderData?.product,
    placeholderData: keepPreviousData,
  });
  const contact = useSiteSetting<Record<string, string>>("contact");

  const related = useQuery<ProductCardData[]>({
    queryKey: [
      "related",
      (product as any)?.category_id,
      (product as any)?.id,
      (product as any)?.related_product_ids,
    ],
    enabled: !!product,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ProductCardData[]> => {
      const p: any = product;
      const explicitIds: string[] = Array.isArray(p.related_product_ids)
        ? p.related_product_ids.filter((id: string) => id && id !== p.id)
        : [];

      let q = supabase
        .from("products")
        .select(
          "id, slug, name_ar, name_en, short_description_ar, short_description_en, description_ar, description_en, icon_url, cover_url, delivery_type, account_type, discount_percent, product_plans(id, price, compare_price, label_ar, label_en, is_active, sort_order, stock)",
        )
        .eq("status", "active")
        .neq("id", p.id);

      if (explicitIds.length > 0) {
        q = q.in("id", explicitIds).limit(explicitIds.length);
      } else {
        const cats: string[] =
          Array.isArray(p.category_ids) && p.category_ids.length > 0
            ? p.category_ids
            : p.category_id
              ? [p.category_id]
              : [];
        if (cats.length > 0) q = q.overlaps("category_ids", cats);
        else if (p.category_id) q = q.eq("category_id", p.category_id);
        q = q.limit(8);
      }

      const { data } = await q;
      return (data ?? []).map((r: any) => {
        const active = (r.product_plans ?? []).filter((pl: any) => pl.is_active);
        const totalStock = active.reduce(
          (s: number, pl: any) => s + Math.max(0, Number(pl.stock ?? 0)),
          0,
        );
        const cheap = active.sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];
        const cheapestPlanComparePrice = cheap ? Number(cheap.compare_price ?? 0) : 0;
        return {
          id: r.id,
          slug: r.slug,
          name_ar: r.name_ar,
          name_en: r.name_en,
          short_description_ar: r.short_description_ar ?? null,
          short_description_en: r.short_description_en ?? null,
          description_ar: r.description_ar,
          description_en: r.description_en,
          icon_url: r.icon_url,
          cover_url: r.cover_url ?? null,
          delivery_type: r.delivery_type,
          account_type: r.account_type,
          discount_percent: r.discount_percent ?? 0,
          minPrice: cheap ? Number(cheap.price) : null,
          cheapestPlanId: cheap?.id ?? null,
          planLabel_ar: cheap?.label_ar ?? null,
          planLabel_en: cheap?.label_en ?? null,
          totalStock,
          cheapestPlanComparePrice: cheapestPlanComparePrice > 0 ? cheapestPlanComparePrice : null,
        };
      });
    },
  });

  const [tab, setTab] = useState<ProfileTab>("plans");
  const [accountType, setAccountType] = useState<string | null>(null);
  const [planVariant, setPlanVariant] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [confirmBuy, setConfirmBuy] = useState(false);

  // New slug → reset local selectors so the kept previous product never shows
  // a stale plan/variant selection while the new one loads underneath.
  useEffect(() => {
    setTab("plans");
    setAccountType(null);
    setPlanVariant(null);
    setPlanId(null);
    setConfirmBuy(false);
  }, [slug]);

  // Shared reviews query (same cache key the reviews panel uses).
  const reviewsQuery = useProductReviews(
    (product as any)?.id as string | undefined,
    loaderData?.reviewSeed as any,
  );

  // Public coupons applicable to this product (safe columns only, via RPC).
  const couponsQuery = useQuery({
    queryKey: ["product-coupons", (product as any)?.id ?? ""],
    enabled: !!product,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async (): Promise<
      {
        code: string;
        discount_type: string;
        discount_value: number;
        min_order_amount: number | null;
      }[]
    > => {
      try {
        const { data, error } = await supabase.rpc("public_coupons_for_product", {
          _product_id: (product as any).id,
        });
        if (error) throw error;
        return (data ?? []) as any;
      } catch {
        return [];
      }
    },
  });
  const [couponStatus, setCouponStatus] = useState<"idle" | "applying" | "applied" | "error">(
    "idle",
  );
  const [couponDiscount, setCouponDiscount] = useState<number | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Roving refs for keyboard-navigable tabs + observer for the in-flow CTAs.
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabsBarRef = useRef<HTMLDivElement | null>(null);
  const ctaRef = useRef<HTMLElement | null>(null);
  const [ctaVisible, setCtaVisible] = useState(false);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setCtaVisible(false);
      return;
    }
    const obs = new IntersectionObserver(([entry]) => setCtaVisible(entry.isIntersecting), {
      threshold: 0.3,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab]);

  // Live viewers counter , seeded per-slug for stability, drifts every few seconds.
  const seed = useMemo(() => {
    let h = 0;
    for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
    return h;
  }, [slug]);
  const [viewers, setViewers] = useState(() => 9 + (seed % 22));
  useEffect(() => {
    const id = setInterval(() => {
      setViewers((v) => {
        const delta = Math.floor(Math.random() * 5) - 2; // -2..+2
        return Math.max(6, Math.min(48, v + delta));
      });
    }, 4500);
    return () => clearInterval(id);
  }, []);

  // Track Meta Pixel ViewContent event
  useEffect(() => {
    if (product) {
      const activePlans = ((product as any).product_plans ?? []).filter((p: any) => p.is_active);
      const minPrice =
        activePlans.length > 0 ? Math.min(...activePlans.map((p: any) => Number(p.price))) : 0;
      trackViewContent({
        id: (product as any).id,
        name: lang === "ar" ? (product as any).name_ar : (product as any).name_en,
        price: minPrice,
      });
    }
  }, [(product as any)?.id]);

  // Reset planId when filters change (must run on every render -keep above early returns)
  useEffect(() => {
    setPlanId(null);
  }, [accountType, planVariant]);

  // Function to extract plan variants from plans
  const getPlanVariants = (plansArray: any[]) => {
    const variantsSet = new Set<string>();
    plansArray.forEach((p) => {
      if (p.plan_variant) {
        variantsSet.add(p.plan_variant);
      } else {
        // If no explicit plan_variant, try to extract from label
        const en = String(p.label_en ?? "");
        const ar = String(p.label_ar ?? "");

        // Common plan variant patterns
        const variantPatterns = [
          "Premium Career",
          "Sales Navigator",
          "Premium Business",
          "Recruiter",
          "Creator",
          "Pro",
          "Plus",
          "Basic",
          "Standard",
          "Enterprise",
          "Premium",
          "Lite",
          "Family",
          "Teams",
          "Business",
          "Personal",
          "Max",
          "Ultimate",
          "Advanced",
          "Essential",
          "بريميوم كاريير",
          "سيلز نافيجاتور",
          "بريميوم بيزنس",
          "ريكروتر",
          "كرييتور",
          "برو",
          "بلس",
          "باسيك",
          "ستاندر",
          "انتربرايز",
          "بريميوم",
          "لايت",
          "فاميلي",
          "تيمز",
          "بيزنس",
          "برسونال",
          "ماكس",
          "التميت",
          "أدفانسد",
          "أسنشال",
        ];

        for (const pattern of variantPatterns) {
          if (en.includes(pattern) || ar.includes(pattern)) {
            variantsSet.add(pattern);
            break;
          }
        }
      }
    });
    return Array.from(variantsSet).filter(Boolean);
  };

  const parsePlan = (pl: any) => {
    const en = String(pl.label_en ?? "");
    const ar = String(pl.label_ar ?? "");
    let acct: "private" | "shared" | "own" | "any" = "any";
    // Prefer explicit account_type set by admin on the plan
    if (
      pl.account_type === "private" ||
      pl.account_type === "shared" ||
      pl.account_type === "own"
    ) {
      acct = pl.account_type;
    } else if (/private/i.test(en) || /خاص|برايفت/i.test(ar)) acct = "private";
    else if (/shared/i.test(en) || /مشترك|شير/i.test(ar)) acct = "shared";
    else if (/\bown\b|our own/i.test(en) || /من عندنا|من عندك|بحسابك|حسابك/i.test(ar)) acct = "own";

    // Use explicit plan_variant if available, otherwise extract from label
    const plan_variant = pl.plan_variant || null;

    // Clean duration strings by removing account type only
    const durEn =
      en.replace(/^(private|shared|own|our own)\s*(account)?\s*[\-–—:]?\s*/i, "").trim() || en;

    const durAr =
      ar
        .replace(/^(حساب\s+)?(خاص|مشترك|من\s*عندنا|من\s*عندك|Private|Shared|Own)\s*[\-–—:]?\s*/i, "")
        .trim() || ar;

    return { acct, durEn, durAr, plan_variant };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <div className="mx-auto w-full max-w-6xl px-3 sm:px-6">
          <div className="mt-3 h-36 animate-pulse rounded-2xl bg-card sm:mt-5 sm:h-56 sm:rounded-3xl" />
          <div className="mt-4 h-40 animate-pulse rounded-2xl bg-card sm:rounded-3xl" />
        </div>
      </div>
    );
  }
  if (!product) return <ProductMissing />;

  const parseDays = (p: any): number => {
    const s = `${p.label_en ?? ""} ${p.label_ar ?? ""}`;
    const m = s.match(/(\d+)\s*(year|month|week|day|سنة|سنه|شهر|شهور|أسبوع|اسبوع|يوم|أيام|ايام)/i);
    if (m) {
      const n = parseInt(m[1]);
      const unit = m[2].toLowerCase();
      if (/year|سنة|سنه/.test(unit)) return n * 365;
      if (/month|شهر|شهور/.test(unit)) return n * 30;
      if (/week|أسبوع|اسبوع/.test(unit)) return n * 7;
      return n;
    }
    const d = Number(p.duration_days);
    if (Number.isFinite(d) && d > 0) return d;
    const n = parseInt(s);
    return Number.isFinite(n) ? n : 0;
  };

  const plans = (product.product_plans ?? [])
    .filter((p: any) => p.is_active)
    .sort((a: any, b: any) => parseDays(a) - parseDays(b));
  const enriched = plans.map((p: any) => ({ ...p, ...parsePlan(p) }));

  // Get all unique plan variants from the enriched plans
  const allPlanVariants = getPlanVariants(enriched);

  // Use productVariants from product data if available, otherwise use extracted variants
  const productVariants = Array.isArray((product as any).plan_variants)
    ? ((product as any).plan_variants as string[]).filter(Boolean)
    : allPlanVariants;

  // Determine effective variant - use selected variant or first available
  const effectiveVariant =
    productVariants.length > 0
      ? planVariant && productVariants.includes(planVariant)
        ? planVariant
        : productVariants[0]
      : null;

  // Get account types from product data or derive from all plans
  const productAcctTypes = (
    Array.isArray((product as any).account_types)
      ? ((product as any).account_types as string[]).filter(
        (a) => a === "private" || a === "shared" || a === "own",
      )
      : []
  ) as ("private" | "shared" | "own")[];

  // Get account types from all plans (not just filtered ones)
  const derivedFromPlans = Array.from(new Set(enriched.map((p: any) => p.acct))).filter(
    (a) => a === "private" || a === "shared" || a === "own",
  ) as ("private" | "shared" | "own")[];

  const accountTypes = (productAcctTypes.length > 0 ? productAcctTypes : derivedFromPlans) as (
    "private" | "shared" | "own"
  )[];

  const effectiveAcct =
    (accountType as "private" | "shared" | "own" | undefined) ?? accountTypes[0];

  // Filter plans based on both account type and plan variant
  const filteredPlans = enriched.filter((p: any) => {
    const acctMatch = !effectiveAcct || p.acct === effectiveAcct || p.acct === "any";
    const variantMatch =
      !effectiveVariant || !p.plan_variant || p.plan_variant === effectiveVariant;
    return acctMatch && variantMatch;
  });

  // A sold-out plan can never be selected in any way: the auto-pick skips
  // zero-stock plans, and a stored id pointing at one is ignored too.
  const hasStock = (p: any) => Number(p?.stock ?? 0) > 0;
  const selected =
    filteredPlans.find((p: any) => p.id === planId && hasStock(p)) ??
    filteredPlans.find(hasStock) ??
    null;

  const selectedStock = Number(selected?.stock ?? 0);
  const selectedSoldOut = !!selected && selectedStock <= 0;
  const name = lang === "ar" ? product.name_ar : product.name_en;
  const shortDescRaw =
    lang === "ar"
      ? ((product as any)?.short_description_ar ?? loaderData?.short_description_ar)
      : ((product as any)?.short_description_en ?? loaderData?.short_description_en);
  const shortDesc = (shortDescRaw ?? "").toString().trim() || null;
  const desc = lang === "ar" ? product.description_ar : product.description_en;
  const liveReviews = (reviewsQuery.data as ProductReviewRow[] | undefined) ?? [];
  const reviewCount =
    liveReviews.length > 0 ? liveReviews.length : (loaderData?.reviewStats?.count ?? 0);
  const reviewAvg =
    liveReviews.length > 0
      ? Math.round(
        (liveReviews.reduce((s, r) => s + Number(r.rating ?? 0), 0) / liveReviews.length) * 10,
      ) / 10
      : (loaderData?.reviewStats?.avg ?? 0);
  const discount = Number((product as any).discount_percent ?? 0);
  const hasDiscount = discount > 0;
  const rawPrice = selected ? Number(selected.price) : 0;
  const comparePrice = selected ? Number(selected.compare_price ?? 0) : 0;
  const hasComparePrice = comparePrice > 0 && comparePrice > rawPrice;
  const finalPrice = hasDiscount ? Math.round(rawPrice * (100 - discount)) / 100 : rawPrice;
  const isAr = lang === "ar";
  const GoIcon = isAr ? ArrowLeft : ArrowRight;
  const isInstant = product.delivery_type === "instant";

  const minPriceAcrossPlans =
    filteredPlans.length > 0 ? Math.min(...filteredPlans.map((p: any) => Number(p.price))) : 0;
  // Fixed floor price across ALL active plans (never changes with filters).
  const minFinalAll =
    enriched.length > 0
      ? Math.min(
        ...enriched.map((p: any) =>
          hasDiscount ? Math.round(Number(p.price) * (100 - discount)) / 100 : Number(p.price),
        ),
      )
      : (loaderData?.minPrice ?? 0);
  const fmtPrice = (n: number) => (Number.isFinite(n) ? n : 0);

  const priceWithOriginal = (original: number, discounted: number) => {
    if (hasDiscount || hasComparePrice) {
      const displayOriginal = hasComparePrice ? comparePrice : original;
      return (
        <span className="flex items-baseline gap-1.5">
          <span className="text-xs text-muted-foreground line-through">
            {displayOriginal} {isAr ? "ج.م" : "EGP"}
          </span>
          <span className="font-mono text-sm font-bold text-brand">
            {discounted} {isAr ? "ج.م" : "EGP"}
          </span>
        </span>
      );
    }
    return (
      <span className="font-mono text-sm font-bold text-brand">
        {discounted} {isAr ? "ج.م" : "EGP"}
      </span>
    );
  };

  const handleAdd = async (goToCart: boolean) => {
    if (!selected) return;
    const acct: "private" | "shared" | "both" | "own" =
      effectiveAcct === "own"
        ? "own"
        : product.account_type === "both"
          ? effectiveAcct === "shared"
            ? "shared"
            : "private"
          : (product.account_type as "private" | "shared" | "both" | "own");
    await addToCart({
      productId: product.id,
      planId: selected.id,
      productName: name,
      planLabel: `${isAr ? selected.durAr : selected.durEn}${effectiveVariant ? ` (${effectiveVariant})` : ""}`,
      price: finalPrice,
      quantity: 1,
      iconUrl: product.icon_url,
      deliveryType: product.delivery_type,
      accountType: acct,
    });
    // Go straight to checkout — /cart is only a redirect stub to /checkout,
    // so routing through it adds a useless navigation flash.
    if (goToCart) navigate({ to: "/checkout" });
  };

  const whatsapp = (contact.data?.whatsapp ?? "").replace(/[^\d]/g, "");
  const selectedPlanLabel = selected
    ? `${isAr ? selected.durAr : selected.durEn}${effectiveVariant ? ` • ${effectiveVariant}` : ""}`
    : "";
  const waStockUrl = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(
      isAr
        ? `عاوز أعرف أول ما تتوفر خدمة ${name}${selectedPlanLabel ? ` (${selectedPlanLabel})` : ""}`
        : `Notify me when ${name} is back in stock`,
    )}`
    : null;

  const acctNames = accountTypes.map((a) =>
    a === "private" ? t.badges.private : a === "own" ? (t.badges as any).own : t.badges.shared,
  );
  const productFacts = [
    {
      label: isAr ? "التسليم" : "Delivery",
      value: isInstant
        ? isAr
          ? "فوري، خلال دقائق"
          : "Instant, within minutes"
        : isAr
          ? "يدوي، خلال 1 – 3 ساعات"
          : "Manual, within 1–3 hours",
    },
    {
      label: isAr ? "نوع الحساب" : "Account",
      value: acctNames.length > 0 ? acctNames.join(" • ") : isAr ? "حسب الخطة" : "Per plan",
    },
    {
      label: isAr ? "الخطط المتاحة" : "Available plans",
      value: isAr ? `${enriched.length} خطط` : `${enriched.length} plans`,
    },
    {
      label: isAr ? "الضمان" : "Warranty",
      value: isAr ? "استبدال فوري طوال المدة" : "Instant replacement for the whole period",
    },
  ];

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const couponSaving = (c: { discount_type: string; discount_value: number }, price: number) =>
    c.discount_type === "percent"
      ? round2((price * Number(c.discount_value)) / 100)
      : Math.min(price, Number(c.discount_value));
  const applicableCoupons = (
    (couponsQuery.data ?? []) as {
      code: string;
      discount_type: string;
      discount_value: number;
      min_order_amount: number | null;
    }[]
  ).filter((c) => (c.min_order_amount ?? 0) <= finalPrice);
  const bestCoupon =
    applicableCoupons.sort(
      (a, b) => couponSaving(b, finalPrice) - couponSaving(a, finalPrice),
    )[0] ?? null;
  const shownSaving = couponDiscount ?? (bestCoupon ? couponSaving(bestCoupon, finalPrice) : 0);
  const afterCouponPrice = Math.max(0, round2(finalPrice - shownSaving));

  const applyCouponNow = async () => {
    if (!bestCoupon || !selected || couponStatus === "applying") return;
    setCouponStatus("applying");
    setCouponMsg(null);
    try {
      const args = {
        _code: bestCoupon.code,
        _subtotal: finalPrice,
        _product_ids: [product.id],
        _items: [{ productId: product.id, price: finalPrice, quantity: 1 }],
      } as any;
      const { data, error } = await supabase.rpc("validate_coupon", args);
      if (error) throw error;
      const row = (data as any)?.[0];
      if (!row?.valid) {
        setCouponStatus("error");
        setCouponMsg(row?.message || (isAr ? "الكود غير صالح حالياً" : "Code is not valid"));
        return;
      }
      setPendingCoupon(row.code);
      setCouponDiscount(Number(row.discount));
      setCouponStatus("applied");
      notify?.(
        isAr
          ? "تم تطبيق الكود بنجاح، جاري تحويلك للدفع..."
          : "Code applied, taking you to checkout...",
        "success",
      );
      // Make sure the selected plan is in the cart, then go to checkout
      // where the saved code auto-applies.
      try {
        await handleAdd(false);
      } catch {
        /* cart state will speak for itself on checkout */
      }
      setTimeout(() => {
        navigate({ to: "/checkout" });
      }, 650);
    } catch (e: any) {
      setCouponStatus("error");
      setCouponMsg(e?.message || (isAr ? "تعذر تطبيق الكود" : "Could not apply the code"));
    }
  };

  const removeCouponNow = () => {
    clearPendingCoupon();
    setCouponStatus("idle");
    setCouponDiscount(null);
    setCouponMsg(null);
  };

  const copyCouponCode = async () => {
    if (!bestCoupon) return;
    try {
      await navigator.clipboard.writeText(bestCoupon.code);
      setCodeCopied(true);
      notify?.(isAr ? "اتنسخ الكود" : "Code copied", "success");
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const tabs: { id: ProfileTab; ar: string; en: string; count?: number }[] = [
    { id: "plans", ar: "الخطط والأسعار", en: "Plans & pricing" },
    { id: "description", ar: "الوصف", en: "Description" },
    { id: "reviews", ar: "آراء العملاء", en: "Reviews", count: reviewCount },
    { id: "delivery", ar: "التسليم والسياسة", en: "Delivery & policy" },
  ];

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    // In RTL ArrowLeft moves forward, in LTR ArrowRight moves forward.
    const forward = isAr ? "ArrowLeft" : "ArrowRight";
    const backward = isAr ? "ArrowRight" : "ArrowLeft";
    let next: number | null = null;
    if (e.key === forward) next = index === last ? 0 : index + 1;
    else if (e.key === backward) next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next !== null) {
      e.preventDefault();
      setTab(tabs[next].id);
      tabRefs.current[next]?.focus();
    }
  };

  const heroStats = [
    {
      n: minFinalAll ? `${fmtPrice(minFinalAll)} ${isAr ? "ج.م" : "EGP"}` : "-",
      l: isAr ? "يبدأ من" : "Starting from",
    },
    {
      n: isInstant ? (isAr ? "فوري" : "Instant") : isAr ? "1-3 ساعات" : "1-3 hrs",
      l: isAr ? "التسليم" : "Delivery",
    },
    { n: "100%", l: isAr ? "ضمان" : "Warranty" },
    {
      n: `${enriched.length}`,
      l: isAr ? "خطة متاحة" : "Plans",
    },
  ];

  const relatedList = (related.data ?? []).slice(0, 8);

  const configuratorProps = {
    accountTypes,
    effectiveAcct,
    onAcctChange: (a: "private" | "shared" | "own") => {
      setAccountType(a);
      setPlanId(null);
      setCouponDiscount(null);
    },
    plans: filteredPlans as any,
    selectedId: selected?.id,
    onSelectPlan: (id: string) => {
      setPlanId(id);
      setCouponDiscount(null);
    },
    discount,
    minRawPrice: minPriceAcrossPlans,
    variants: productVariants,
    effectiveVariant,
    onVariantChange: (v: string) => {
      setPlanVariant(v);
      setPlanId(null);
      setCouponDiscount(null);
    },
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="mx-auto w-full max-w-6xl px-3 sm:px-6">
        {/* ── Cover with embedded identity ── */}
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] sm:mt-5 sm:rounded-3xl">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.25) 0, transparent 28%), radial-gradient(circle at 60% 15%, rgba(255,255,255,.2) 0, transparent 25%)",
            }}
          />
          {product.icon_url ? (
            <div className="pointer-events-none absolute -bottom-8 end-4 size-44 rotate-[-8deg] select-none sm:end-8 sm:size-64">
              <img
                src={product.icon_url}
                alt=""
                aria-hidden
                className="size-full rounded-3xl object-cover opacity-80 shadow-2xl ring-4 ring-white/60"
              />
              {hasDiscount && (
                <span className="absolute top-2 start-2 rounded-lg bg-destructive px-2 py-0.5 text-[11px] font-black text-destructive-foreground shadow-lg">
                  -{discount}%
                </span>
              )}
            </div>
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-8 end-4 grid size-44 rotate-[-8deg] place-items-center rounded-3xl bg-white/20 text-6xl font-black text-white/70 select-none sm:end-8 sm:size-64 sm:text-8xl"
            >
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/70 via-[#0b3fa0]/15 to-transparent"
          />
          {/* Breadcrumb over cover */}
          <nav
            aria-label="breadcrumb"
            className="absolute top-3 start-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] text-white backdrop-blur-md sm:top-4 sm:start-4 sm:text-xs"
          >
            <Link to="/" className="shrink-0 transition hover:text-white/70">
              {isAr ? "الرئيسية" : "Home"}
            </Link>
            <span aria-hidden className="opacity-60">
              /
            </span>
            <Link to="/shop" className="shrink-0 transition hover:text-white/70">
              {isAr ? "المتجر" : "Shop"}
            </Link>
            <span aria-hidden className="opacity-60">
              /
            </span>
            <span className="max-w-32 truncate font-bold sm:max-w-56">{name}</span>
          </nav>
          {/* Identity inside cover */}
          <div className="relative px-3 pb-4 pt-10 sm:px-5 sm:pb-6 sm:pt-14">
            <h1 className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight text-white drop-shadow-md sm:text-3xl">
              <span className="truncate">{name}</span>
              <BadgeCheck
                className="size-5 shrink-0 text-white sm:size-6"
                aria-label={isAr ? "خدمة موثقة" : "Verified"}
              />
            </h1>
            <p
              className="mt-2 line-clamp-4 max-w-2xl text-xs leading-relaxed whitespace-pre-line text-white/85 drop-shadow sm:text-sm"
              dir={isAr ? "rtl" : "ltr"}
            >
              {shortDesc ? (
                <InlineMarkdown text={shortDesc} />
              ) : isAr ? (
                "اشتراك أصلي بضمان كامل وتسليم فوري"
              ) : (
                "Genuine plan, full warranty"
              )}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                <span className="tabular-nums">{viewers}</span> {t.product.viewersNow}
              </span>
              {reviewCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTab("reviews");
                    tabsBarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 backdrop-blur-md transition hover:brightness-110 active:scale-95"
                  aria-label={
                    isAr
                      ? `التقييم ${reviewAvg.toFixed(1)} من 5 من ${reviewCount} تقييم، اضغط لعرض التقييمات`
                      : `Rated ${reviewAvg.toFixed(1)} out of 5 from ${reviewCount} reviews, tap to view`
                  }
                >
                  <Star className="size-3 fill-current" aria-hidden />
                  <span className="tabular-nums">{reviewAvg.toFixed(1)}</span>
                  <span className="tabular-nums opacity-70">({reviewCount})</span>
                </button>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md">
                <Truck className="size-3" />
                {isInstant ? (isAr ? "تسليم فوري" : "Instant") : isAr ? "تفعيل يدوي" : "Manual"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Stats strip (same as home) ── */}
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 sm:px-4">
          {heroStats.map((s) => (
            <div
              key={s.l}
              className="flex flex-col rounded-2xl border border-border/60 bg-card px-4 py-3 text-center transition hover:border-brand/40 sm:py-4"
            >
              <dt className="order-2 mt-0.5 block text-[11px] text-muted-foreground sm:text-xs">
                {s.l}
              </dt>
              <dd className="order-1 truncate text-lg font-extrabold text-brand-deep tabular-nums sm:text-2xl">
                {s.n}
              </dd>
            </div>
          ))}
        </dl>

        {/* ── Tabs (same sticky social-style as home) ── */}
        <div
          ref={tabsBarRef}
          className="sticky z-30 -mx-3 mt-4 scroll-mt-24 border-y border-border/60 bg-card/95 px-3 backdrop-blur-md sm:-mx-6 sm:px-6"
          style={{ top: "var(--app-header-h, 56px)" }}
        >
          <div
            className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto no-scrollbar"
            role="tablist"
          >
            {tabs.map((tb, i) => (
              <button
                key={tb.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`product-tab-${tb.id}`}
                role="tab"
                aria-selected={tab === tb.id}
                aria-controls={`product-panel-${tb.id}`}
                tabIndex={tab === tb.id ? 0 : -1}
                onClick={() => setTab(tb.id)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
                className={`relative shrink-0 px-4 py-3 text-sm font-bold transition outline-none active:scale-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-[15px] ${tab === tb.id ? "text-brand-deep" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                {isAr ? tb.ar : tb.en}
                {tb.count !== undefined && tb.count > 0 && (
                  <span className="ms-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-black text-brand tabular-nums">
                    {tb.count}
                  </span>
                )}
                {tab === tb.id && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Feed (same rhythm as home) ── */}
        <div className="py-5 sm:py-7">
          {tab === "plans" && (
            <section
              role="tabpanel"
              id="product-panel-plans"
              aria-labelledby="product-tab-plans"
              tabIndex={0}
              aria-label={isAr ? "الخطط والأسعار" : "Plans & pricing"}
              className="outline-none"
            >
              {bestCoupon && selected && !selectedSoldOut && (
                <div className="mb-4 overflow-hidden rounded-2xl border-2 border-dashed border-brand/40 bg-gradient-to-l from-brand/[0.09] to-transparent sm:rounded-3xl">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-brand-foreground shadow-sm">
                        <TicketPercent className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold">
                          {isAr ? "كود خصم خاص بالخدمة دي" : "A coupon just for this service"}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {isAr ? (
                            <>
                              هيوفر لك{" "}
                              <b className="text-success tabular-nums">{shownSaving} ج.م</b> - السعر
                              بعد الكود{" "}
                              <b className="text-brand-deep tabular-nums">{afterCouponPrice} ج.م</b>
                            </>
                          ) : (
                            <>
                              Saves <b className="text-success tabular-nums">{shownSaving} EGP</b> -
                              price after code{" "}
                              <b className="text-brand-deep tabular-nums">{afterCouponPrice} EGP</b>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={copyCouponCode}
                        dir="ltr"
                        aria-label={
                          isAr ? `نسخ الكود ${bestCoupon.code}` : `Copy code ${bestCoupon.code}`
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 font-mono text-sm font-black tracking-wider transition hover:border-brand/60 hover:text-brand active:scale-95"
                      >
                        {bestCoupon.code}
                        {codeCopied ? (
                          <Check className="size-4 text-success" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                      </button>
                      {couponStatus === "applied" ? (
                        <SiteButton
                          variant="outline"
                          size="sm"
                          onClick={removeCouponNow}
                          title={
                            isAr
                              ? "الكود محفوظ وهيتطبق في الدفع - اضغط للإزالة"
                              : "Code saved for checkout - tap to remove"
                          }
                          className="border-success/30 bg-success/15 font-black text-success hover:border-success/60 hover:text-success"
                        >
                          <Check className="size-4" />
                          {isAr ? "مطبق" : "Applied"}
                        </SiteButton>
                      ) : (
                        <SiteButton
                          variant="success"
                          size="sm"
                          onClick={applyCouponNow}
                          disabled={couponStatus === "applying"}
                          className="font-black"
                        >
                          {couponStatus === "applying" ? "…" : isAr ? "تطبيق فوري" : "Apply now"}
                        </SiteButton>
                      )}
                    </div>
                  </div>
                  {couponStatus === "error" && couponMsg && (
                    <p className="px-4 pb-3 text-xs font-bold text-destructive sm:px-5">
                      {couponMsg}
                    </p>
                  )}
                  {couponStatus === "applied" && (
                    <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
                      {isAr
                        ? "تم تطبيق الكود - جاري تحويلك لصفحة الدفع وهيكون متطبق هناك."
                        : "Code applied - taking you to checkout with it applied."}
                    </p>
                  )}
                </div>
              )}
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
                <PricingConfigurator {...configuratorProps} />
                <aside
                  ref={ctaRef}
                  className="min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:rounded-3xl sm:p-5 lg:sticky"
                  style={{ top: "calc(var(--app-header-h, 56px) + 64px)" }}
                >
                  {selected && !selectedSoldOut ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-brand">
                        {isAr ? "الإجمالي" : "Total"}
                      </span>
                      {(hasDiscount || hasComparePrice) && (
                        <span className="text-xs text-muted-foreground line-through tabular-nums">
                          {hasComparePrice ? comparePrice : rawPrice} {isAr ? "ج.م" : "EGP"}
                        </span>
                      )}
                    </div>
                  ) : null}
                  {selected ? (
                    selectedSoldOut ? (
                      <p className="mt-1 text-xl font-black text-destructive">
                        {t.product.soldOut}
                      </p>
                    ) : (
                      <div className="mt-1">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-2xl font-black text-brand-deep tabular-nums sm:text-3xl">
                            {finalPrice}
                          </span>
                          <span className="text-xs font-extrabold text-brand-deep">
                            {isAr ? "ج.م" : "EGP"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs font-bold text-muted-foreground">
                          {isAr ? selected.durAr : selected.durEn}
                          {effectiveVariant ? ` • ${effectiveVariant}` : ""}
                        </p>
                      </div>
                    )
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isAr ? "لا توجد خطط متاحة حالياً" : "No plans available"}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {hasDiscount && selected && !selectedSoldOut && (
                      <span className="rounded-lg border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-black text-success tabular-nums">
                        -{discount}%
                      </span>
                    )}
                    {selectedStock > 0 && selectedStock <= 10 && (
                      <span className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-black text-warning">
                        {t.product.stockLeft(selectedStock)}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    {selectedSoldOut && waStockUrl ? (
                      <SiteButton variant="primary" size="lg" asChild className="w-full">
                        <a href={waStockUrl} target="_blank" rel="noopener noreferrer">
                          <WhatsAppIcon className="size-4" />
                          {isAr ? "نبهني أول ما تتوفر" : "Notify me when available"}
                        </a>
                      </SiteButton>
                    ) : (
                      <SiteButton
                        variant="primary"
                        size="lg"
                        onClick={() => setConfirmBuy(true)}
                        disabled={!selected || selectedSoldOut}
                        className="w-full"
                      >
                        <Zap className="size-4" />
                        {selectedSoldOut ? t.product.soldOut : t.product.buyNow}
                      </SiteButton>
                    )}
                    <SiteButton
                      variant="outline"
                      size="lg"
                      onClick={() => handleAdd(false)}
                      disabled={!selected || selectedSoldOut}
                      className="w-full"
                    >
                      <ShoppingCart className="size-4" />
                      {selectedSoldOut ? t.product.soldOut : t.product.addToCart}
                    </SiteButton>
                  </div>
                  <ul className="mt-3 space-y-1.5 rounded-xl bg-background/60 p-3 text-[11px] text-muted-foreground">
                    {(isAr
                      ? ["دفع آمن ومشفر 100%", "فاتورة وضمان مكتوب لكل طلب", "دعم واتساب بعد البيع"]
                      : [
                        "100% secure encrypted payment",
                        "Invoice & written warranty per order",
                        "After-sale WhatsApp support",
                      ]
                    ).map((x) => (
                      <li key={x} className="flex items-center gap-1.5">
                        <Check className="size-3.5 shrink-0 text-success" />
                        <span className="leading-relaxed">{x}</span>
                      </li>
                    ))}
                  </ul>
                </aside>
              </div>
            </section>
          )}

          {tab === "description" && (
            <section
              role="tabpanel"
              id="product-panel-description"
              aria-labelledby="product-tab-description"
              tabIndex={0}
              aria-label={isAr ? "الوصف" : "Description"}
              className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm outline-none sm:rounded-3xl sm:p-8"
            >
              <ProductDescription
                productName={name}
                description={desc}
                isAr={isAr}
                facts={productFacts}
              />
            </section>
          )}

          {tab === "reviews" && (
            <section
              role="tabpanel"
              id="product-panel-reviews"
              aria-labelledby="product-tab-reviews"
              tabIndex={0}
              aria-label={isAr ? "التقييمات" : "Reviews"}
              className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm outline-none sm:rounded-3xl sm:p-8"
            >
              <ProductReviews isAr={isAr} productId={product.id} />
            </section>
          )}

          {tab === "delivery" && (
            <section
              role="tabpanel"
              id="product-panel-delivery"
              aria-labelledby="product-tab-delivery"
              tabIndex={0}
              aria-label={isAr ? "التسليم والسياسة" : "Delivery & policy"}
              className="space-y-4 outline-none"
            >
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:rounded-3xl sm:p-8">
                <ProductDelivery deliveryType={product.delivery_type} isAr={isAr} />
              </div>
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:rounded-3xl sm:p-8">
                <ProductPolicy isAr={isAr} />
              </div>
            </section>
          )}
        </div>

        {/* ── Related (same feed grid as home) ── */}
        {relatedList.length > 0 && (
          <section aria-label={isAr ? "منتجات مشابهة" : "Related products"}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-brand-foreground shadow-sm sm:text-sm">
                {isAr ? "خدمات مشابهة" : "Similar services"}
              </span>
              <Link
                to="/shop"
                className="ms-auto inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline sm:text-sm"
              >
                {isAr ? "عرض الكل" : "View all"}
                <GoIcon className="size-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
              {relatedList.map((p, i) => (
                <div key={p.id} className={i >= 4 ? "hidden lg:block" : ""}>
                  <ProductCard p={p} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Help band (same as home) ── */}
        <section className="mb-8 mt-6 overflow-hidden rounded-2xl bg-gradient-to-l from-[#0b3fa0] via-[#0096cf] to-[#00a9e0] p-5 text-white sm:mb-10 sm:mt-8 sm:rounded-3xl sm:p-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-extrabold sm:text-2xl">
                {isAr
                  ? "محتار تختار إيه؟ سهلنالك الاختيار"
                  : "Not sure what to pick? We make it easy"}
              </h2>
              <p className="mt-1 text-xs text-white/85 sm:text-sm">
                {isAr
                  ? "ابعتلنا على واتساب وهنرشحلك أنسب اشتراك لاحتياجك وميزانيتك."
                  : "Message us on WhatsApp and we'll recommend the right plan for you."}
              </p>
            </div>
            {whatsapp ? (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#0b3fa0] transition hover:brightness-95 active:scale-95"
              >
                <WhatsAppIcon className="size-4" />
                {isAr ? "استشارة مجانية" : "Free advice"}
              </a>
            ) : (
              <Link
                to="/shop"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#0b3fa0] transition hover:brightness-95 active:scale-95"
              >
                <Store className="size-4" />
                {isAr ? "تصفح المتجر" : "Browse shop"}
              </Link>
            )}
          </div>
        </section>
      </main>

      {/* ── Confirm dialog ── */}
      {confirmBuy &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
            onClick={() => setConfirmBuy(false)}
          >
            <div
              className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-2 text-lg font-extrabold">
                {isAr ? "تأكيد الشراء" : "Confirm purchase"}
              </h3>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                {isAr
                  ? `هتشتري ${name} ، ${selected ? (isAr ? selected.durAr : selected.durEn) : ""} بسعر ${finalPrice} ج.م. تتابع للدفع؟`
                  : `You are about to buy ${name} ، ${selected?.durEn} for ${finalPrice} EGP. Continue to checkout?`}
              </p>
              <div className="flex gap-2.5">
                <SiteButton
                  variant="outline"
                  size="pill"
                  onClick={() => setConfirmBuy(false)}
                  className="flex-1"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </SiteButton>
                <SiteButton
                  variant="primary"
                  size="pill"
                  onClick={() => {
                    setConfirmBuy(false);
                    handleAdd(true);
                  }}
                  className="flex-1"
                >
                  {isAr ? "تأكيد" : "Confirm"}
                </SiteButton>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Mobile sticky buy bar (hidden while the in-flow CTAs are visible) ── */}
      {selected &&
        !ctaVisible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-card/95 backdrop-blur lg:hidden"
            style={{ padding: "0.75rem 0.75rem max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="font-black text-brand">{isAr ? "الإجمالي" : "Total"}</span>
              <span
                className={`truncate text-xl font-black tabular-nums ${selectedSoldOut ? "text-destructive line-through" : "text-brand"}`}
              >
                {selectedSoldOut ? t.product.soldOut : priceWithOriginal(rawPrice, finalPrice)}
              </span>
              {selectedPlanLabel && (
                <span className="max-w-40 truncate text-[10px] font-bold text-muted-foreground">
                  {selectedPlanLabel}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SiteButton
                variant="outline"
                size="iconLg"
                onClick={() => handleAdd(false)}
                disabled={selectedSoldOut}
                aria-label={isAr ? "أضف للسلة" : "Add to cart"}
                className="bg-muted/50 hover:bg-muted"
              >
                <ShoppingCart />
              </SiteButton>
              {selectedSoldOut && waStockUrl ? (
                <SiteButton variant="primary" size="iconLg" asChild>
                  <a
                    href={waStockUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={isAr ? "اسأل عن التوفر واتساب" : "Ask on WhatsApp"}
                  >
                    <WhatsAppIcon />
                  </a>
                </SiteButton>
              ) : (
                <SiteButton
                  variant="primary"
                  size="pill"
                  onClick={() => setConfirmBuy(true)}
                  disabled={selectedSoldOut}
                  className="px-6"
                >
                  {selectedSoldOut ? t.product.soldOut : t.product.buyNow}
                </SiteButton>
              )}
            </div>
          </div>,
          document.body,
        )}
      <Footer />
      {/* spacer so the fixed mobile buy bar never covers the footer rights */}
      <div aria-hidden className="h-[calc(88px+env(safe-area-inset-bottom))] lg:hidden" />
    </div>
  );
}

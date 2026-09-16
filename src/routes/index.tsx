import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useMemo, useState, type ComponentType } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  Store,
  Youtube,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteButton } from "@/components/ui/site-button";
import { ProductCard, type ProductCardData } from "@/components/ProductCard";
import { CategoryChip } from "@/components/CategoryCard";
import { FAQ_ITEMS_AR } from "@/lib/faq-items";
import { heroLogosQuery } from "@/components/HeroDecor";

const Testimonials = lazy(() =>
  import("@/components/Testimonials").then((m) => ({ default: m.Testimonials })),
);
const FAQ = lazy(() => import("@/components/FAQ").then((m) => ({ default: m.FAQ })));

import { useApp } from "@/contexts/AppContext";
import { useBrandSetting, useSiteSetting } from "@/hooks/useSiteSetting";
import { withTimeout, warmInBackground, CRITICAL_LOADER_TIMEOUT_MS } from "@/lib/loader-timeout";
import { healServerValue } from "@/lib/server-query-cache";
import { featuredProductsQuery, bestSellersQuery, allProductsQuery, siteSettingQuery } from "@/lib/home-queries";
import {
  brandsStripQuery,
  categoriesShowcaseQuery,
  categoryRowsQuery,
  footerCategoriesQuery,
  publicFaqsQuery,
  testimonialImagesQuery,
} from "@/lib/public-queries";

export const Route = createFileRoute("/")({
  head: ({ loaderData }: { loaderData?: { heroLogos?: string[]; brand?: any } }) => ({
    meta: [
      { title: "سهلنالك | اشتراكات ChatGPT وMidjourney الأصلية في مصر" },
      {
        name: "description",
        content:
          "أرخص أسعار اشتراكات الذكاء الاصطناعي والتصميم بالجنيه: ChatGPT Plus وMidjourney وCanva Pro بتسليم فوري وضمان الاستبدال.",
      },
      {
        name: "keywords",
        content:
          "اشتراك ChatGPT مصر, Midjourney بالجنيه, Canva Pro مصر, اشتراكات أصلية, تسليم فوري, سهلنالك",
      },
      {
        property: "og:title",
        content: "سهلنالك | اشتراكات ChatGPT وMidjourney الأصلية في مصر",
      },
      {
        property: "og:description",
        content:
          "اشتراكك الأصلي بالجنيه يوصلك على الإيميل في دقائق - ضمان حقيقي ودعم واتساب في أي وقت.",
      },
      { property: "og:url", content: "https://rapidkeyz.com/" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://rapidkeyz.com/cover.webp" },
      { property: "og:image:secure_url", content: "https://rapidkeyz.com/cover.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "سهلنالك | اشتراكات ChatGPT وMidjourney الأصلية في مصر" },
      { name: "twitter:image", content: "https://rapidkeyz.com/cover.webp" },
    ],
    links: [
      { rel: "canonical", href: "https://rapidkeyz.com/" },
      // Preload the hero icons so they are decoded before the splash disappears.
      ...(loaderData?.heroLogos ?? [])
        .slice(0, 8)
        .map((href) => ({ rel: "preload", as: "image", href })),
      // The cover + avatar paint on the very first frame: preload them so the
      // browser fetches them with the highest priority instead of discovering
      // them late after hydration (the "empty blue cover" flash on hard refresh).
      ...(loaderData?.brand?.cover_url
        ? [{ rel: "preload", as: "image", href: loaderData.brand.cover_url as string }]
        : []),
      ...(loaderData?.brand?.avatar_url
        ? [{ rel: "preload", as: "image", href: loaderData.brand.avatar_url as string }]
        : []),
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS_AR.map((it) => ({
            "@type": "Question",
            name: it.q,
            acceptedAnswer: { "@type": "Answer", text: it.a },
          })),
        }),
      },
    ],
  }),
  // The loader blocks the SSR response: until it resolves the browser receives
  // zero bytes (blank tab , the splash isn't even in the DOM yet). So it may
  // only await the above-the-fold data, and only with a hard deadline.
  // Everything below the fold is warmed in the background and refetched by the
  // client if the server didn't finish in time.
  loader: async ({ context }) => {
    const qc = context.queryClient;

    // 1) Above the fold , awaited, but never longer than the deadline.
    // Brand/socials/contact are here too: the identity buttons (WhatsApp,
    // shop, socials) must render on the very first paint, not pop in later.
    // bestSellers + allProducts are here as well: the default feed shows them
    // immediately instead of flashing an empty state on hard refresh.
    // NOTE: 11 promises → 11 variables. A missing slot here silently shifts
    // every value after it (brand:=categories, socials:=brand, ...) and drops
    // the last one — that exact misalignment once hid the WhatsApp/socials
    // buttons permanently. Count them if you ever touch this list.
    const [hero, stats, featured, heroLogos, brands, catsShowcase, brand, socials, contact, bestSellers, allProducts] = await Promise.all([
      withTimeout(
        qc.ensureQueryData(siteSettingQuery<Record<string, any>>("hero")),
        CRITICAL_LOADER_TIMEOUT_MS,
        null,
      ),
      withTimeout(
        qc.ensureQueryData(siteSettingQuery<Record<string, number>>("stats")),
        CRITICAL_LOADER_TIMEOUT_MS,
        null,
      ),
      withTimeout(
        qc.ensureQueryData(featuredProductsQuery()),
        CRITICAL_LOADER_TIMEOUT_MS,
        [] as any[],
      ),
      withTimeout(qc.ensureQueryData(heroLogosQuery()), CRITICAL_LOADER_TIMEOUT_MS, [] as string[]),
      withTimeout(qc.ensureQueryData(brandsStripQuery()), CRITICAL_LOADER_TIMEOUT_MS, [] as any[]),
      withTimeout(
        qc.ensureQueryData(categoriesShowcaseQuery()),
        CRITICAL_LOADER_TIMEOUT_MS,
        [] as any[],
      ),
      withTimeout(
        qc.ensureQueryData(siteSettingQuery("brand")),
        CRITICAL_LOADER_TIMEOUT_MS,
        null,
      ),
      withTimeout(
        qc.ensureQueryData(siteSettingQuery("socials")),
        CRITICAL_LOADER_TIMEOUT_MS,
        null,
      ),
      withTimeout(
        qc.ensureQueryData(siteSettingQuery("contact")),
        CRITICAL_LOADER_TIMEOUT_MS,
        null,
      ),
      withTimeout(
        qc.ensureQueryData(bestSellersQuery()),
        CRITICAL_LOADER_TIMEOUT_MS,
        [] as any[],
      ),
      withTimeout(
        qc.ensureQueryData(allProductsQuery()),
        CRITICAL_LOADER_TIMEOUT_MS,
        [] as any[],
      ),
    ]);

    // 1b) Heal deadline-misses. Proven by SSR inspection: in slow environments
    // some queries deterministically lose the 2.5s race (null/[] fallbacks)
    // while their ensureQueryData promise resolves a second later. The stale
    // loaderData then poisons hydration (sections render, then "disappear").
    // Heal from the live cache (late arrival) or the last-good server snapshot
    // before falling back to empty.
    const heroH = healServerValue("home:hero", qc, siteSettingQuery("hero").queryKey, hero, null);
    const statsH = healServerValue("home:stats", qc, siteSettingQuery("stats").queryKey, stats, null);
    const featuredH = healServerValue("home:featured", qc, featuredProductsQuery().queryKey, featured, [] as any[]);
    const heroLogosH = healServerValue("home:heroLogos", qc, heroLogosQuery().queryKey, heroLogos, [] as string[]);
    const brandsH = healServerValue("home:brands", qc, brandsStripQuery().queryKey, brands, [] as any[]);
    const catsShowcaseH = healServerValue("home:catsShowcase", qc, categoriesShowcaseQuery().queryKey, catsShowcase, [] as any[]);
    const brandH = healServerValue("home:brand", qc, siteSettingQuery("brand").queryKey, brand, null);
    const socialsH = healServerValue("home:socials", qc, siteSettingQuery("socials").queryKey, socials, null);
    const contactH = healServerValue("home:contact", qc, siteSettingQuery("contact").queryKey, contact, null);
    const bestSellersH = healServerValue("home:best", qc, bestSellersQuery().queryKey, bestSellers, [] as any[]);
    const allProductsH = healServerValue("home:all", qc, allProductsQuery().queryKey, allProducts, [] as any[]);
    // NOTE: `cats` renders from the live cache below; the loader only warms it.

    // 2) Below the fold , warmed in the *page order* of the sections, one after
    // another, and never awaited. Firing all of them in parallel used to
    // saturate the free-tier Supabase pool and slow the whole first paint.
    warmInBackground(
      [
        categoryRowsQuery(["ai-tools", "design"]),
        testimonialImagesQuery(),
        publicFaqsQuery(),
        footerCategoriesQuery(),
      ].map((opts) => qc.prefetchQuery(opts as any)),
    );

    // Service count per category, computed once from the HEALED rows. The
    // client seeds its chips from this static map so the counts are stable
    // from the very first frame: they can never appear → vanish → reappear
    // while best/all/featured resolve at different times. Live queries take
    // over only once they actually hold data.
    const catCounts: Record<string, number> = {};
    for (const p of (allProductsH as any[]) ?? []) {
      const ids = new Set<string>();
      if ((p as any).category_id) ids.add((p as any).category_id);
      for (const id of (p as any).category_ids ?? []) ids.add(id);
      for (const id of ids) catCounts[id] = (catCounts[id] ?? 0) + 1;
    }

    return { hero: heroH, stats: statsH, featured: featuredH, bestSellers: bestSellersH, allProducts: allProductsH, heroLogos: heroLogosH, brands: brandsH, catsShowcase: catsShowcaseH, brand: brandH, socials: socialsH, contact: contactH, catCounts };
  },
  component: HomePage,
});

type FeedFilter = "best" | "all";

/** Initial visible cards: 6 on phones, 12 on desktop. */
function initialVisible(): number {
  if (typeof window !== "undefined" && window.innerWidth < 640) return 6;
  return 12;
}
function moreStep(): number {
  if (typeof window !== "undefined" && window.innerWidth < 640) return 6;
  return 12;
}

function HomePage() {
  const { lang } = useApp();
  const initial = Route.useLoaderData();
  const [feed, setFeed] = useState<FeedFilter>("best");
  const [visibleCount, setVisibleCount] = useState<number>(initialVisible);

  const featured = useQuery({
    ...featuredProductsQuery(),
    // Same null/empty-seed trap as the settings: an empty loader fallback must
    // not freeze the query — leave it undefined so it refetches in background.
    initialData: (initial.featured as ProductCardData[])?.length
      ? (initial.featured as ProductCardData[])
      : undefined,
    placeholderData: keepPreviousData,
  });
  const best = useQuery({
    ...bestSellersQuery(),
    // Only seed when the server actually had the list; an empty seed would
    // otherwise be treated as fresh data and never refetch.
    initialData: (initial.bestSellers as ProductCardData[])?.length
      ? (initial.bestSellers as ProductCardData[])
      : undefined,
    placeholderData: keepPreviousData,
  });
  const heroSetting = useQuery({
    ...siteSettingQuery<Record<string, any>>("hero"),
    // Guard the null-seed trap (see useSiteSetting): a loader deadline-miss
    // must leave the query empty so it refetches, not frozen on null.
    initialData: (initial.hero as Record<string, any> | null) ?? undefined,
    placeholderData: keepPreviousData,
  });
  const statsSetting = useQuery({
    ...siteSettingQuery<Record<string, number>>("stats"),
    initialData: (initial.stats as Record<string, number> | null) ?? undefined,
    placeholderData: keepPreviousData,
  });
  // No initialData here on purpose (below-the-fold, warmed in background):
  // keepPreviousData keeps the section stable across realtime refetches.
  const cats = useQuery({
    ...categoriesShowcaseQuery(),
    placeholderData: keepPreviousData,
  });
  const everything = useQuery({
    ...allProductsQuery(),
    initialData: (initial.allProducts as ProductCardData[])?.length
      ? (initial.allProducts as ProductCardData[])
      : undefined,
    placeholderData: keepPreviousData,
  });
  const brand = useBrandSetting((initial.brand ?? null) as any);
  const socials = useSiteSetting<Record<string, string>>("socials", (initial.socials ?? null) as any);
  const contact = useSiteSetting<Record<string, string>>("contact", (initial.contact ?? null) as any);

  const h: Record<string, any> = (heroSetting.data as any) ?? {};
  const bio =
    ((lang === "ar" ? h.subtitle_ar : h.subtitle_en) as string | undefined)?.trim() ||
    (lang === "ar"
      ? "اشتراكات أصلية بأسعار مصرية وتسليم فوري خلال دقائق. ضمان 100% ودعم 24/7."
      : "Genuine subscriptions at Egyptian prices with instant delivery. 100% guarantee and 24/7 support.");
  const displayName =
    ((lang === "ar" ? brand.data?.name_ar : brand.data?.name_en) as string | undefined)?.trim() ||
    (brand.data?.name_ar || brand.data?.name_en || "").trim() ||
    (lang === "ar" ? "سهلنالك" : "Sahlnalk");
  const coverSrc = (brand.data?.cover_url ?? "").trim() || "/cover.webp";
  const avatarSrc = (brand.data?.avatar_url ?? "").trim() || "/pp.webp";

  // Stats come from the dashboard `stats` setting only - never demo values.
  const statsValues = statsSetting.data ?? {};
  const fmt = (n: number) => (n >= 1000 ? `+${Math.round(n / 1000)}k` : `+${n}`);
  const heroStats = (
    [
      { key: "customers", l_ar: "عميل سعيد", l_en: "Happy clients" },
      { key: "orders", l_ar: "عملية شراء ناجحة", l_en: "Orders" },
      { key: "services", l_ar: "خدمة رقمية", l_en: "Services" },
      { key: "years", l_ar: "سنين خبرة", l_en: "Years" },
      { key: "staff", l_ar: "موظف دعم", l_en: "Support staff" },
    ] as const
  )
    .filter((s) => Number(statsValues[s.key] ?? 0) > 0)
    .slice(0, 4)
    .map((s) => ({ n: fmt(Number(statsValues[s.key])), l: lang === "ar" ? s.l_ar : s.l_en }));

  const featuredList = featured.data ?? [];
  const bestList = best.data ?? [];
  // "الكل" = every active service on the website (falls back to the
  // best+featured union while the full list is still loading).
  const allList = useMemo(() => {
    const full = (everything.data ?? []) as ProductCardData[];
    if (full.length > 0) return full;
    const map = new Map<string, ProductCardData>();
    for (const p of [...bestList, ...featuredList]) {
      if (p && !map.has(p.id)) map.set(p.id, p);
    }
    return [...map.values()];
  }, [everything.data, bestList, featuredList]);

  // Service count per category (same matching rules as /shop).
  // Stable seed: loader-computed counts render on the first frame and never
  // flicker; the live map replaces them only once it holds real data.
  const liveCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of allList as any[]) {
      const ids = new Set<string>();
      if (p.category_id) ids.add(p.category_id);
      for (const id of p.category_ids ?? []) ids.add(id);
      for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [allList]);
  const loaderCounts = useMemo(() => {
    const m = new Map<string, number>();
    const raw = (initial as any).catCounts as Record<string, number> | undefined;
    if (raw) for (const [k, v] of Object.entries(raw)) m.set(k, Number(v) || 0);
    return m;
  }, [initial]);
  const catCounts = liveCounts.size > 0 ? liveCounts : loaderCounts;

  const feedBase = feed === "best" ? bestList : allList;
  const feedResolved = feedBase.length > 0 ? feedBase : allList;
  // Still fetching the very first batch: show skeletons, never a wrong
  // "no products" flash.
  const feedPending = (best.isLoading || everything.isLoading) && feedResolved.length === 0;
  const shown = feedResolved.slice(0, visibleCount);
  const hasMore = visibleCount < feedResolved.length;

  const pickFeed = (f: FeedFilter) => {
    setFeed(f);
    setVisibleCount(initialVisible());
  };

  const whatsapp = (contact.data?.whatsapp ?? "").replace(/[^\d]/g, "");
  const email = (contact.data?.email ?? "").trim();

  const socialLinks: {
    key: string;
    href: string;
    Icon: ComponentType<{ className?: string }>;
    label: string;
  }[] = [
    { key: "facebook", Icon: Facebook, label: "Facebook" },
    { key: "instagram", Icon: Instagram, label: "Instagram" },
    { key: "youtube", Icon: Youtube, label: "YouTube" },
    { key: "linkedin", Icon: Linkedin, label: "LinkedIn" },
  ]
    .map((s) => ({ ...s, href: (socials.data?.[s.key] ?? "").trim() }))
    .filter((s) => s.href.length > 0);

  const feeds: { id: FeedFilter; ar: string; en: string }[] = [
    { id: "best", ar: "الأكثر مبيعاً", en: "Best sellers" },
    { id: "all", ar: "الكل", en: "All" },
  ];
  const GoIcon = lang === "ar" ? ArrowLeft : ArrowRight;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="mx-auto w-full max-w-6xl px-3 sm:px-6">
        {/* ── Cover ── */}
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] sm:mt-5 sm:rounded-3xl">
          <img
            src={coverSrc}
            alt=""
            aria-hidden
            width={1600}
            height={500}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="h-36 w-full object-cover sm:h-56 lg:h-64"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/25 via-transparent to-transparent"
          />
        </div>

        {/* ── Identity row ── */}
        <div className="flex flex-col gap-4 px-1 pt-0 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:px-4">
          <div className="flex items-end gap-3 sm:gap-4">
            <img
              src={avatarSrc}
              alt={displayName}
              width={192}
              height={192}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="mt-3 size-24 shrink-0 rounded-full bg-white object-cover shadow-xl ring-4 ring-white sm:mt-4 sm:size-32"
            />
            <div className="min-w-0 pb-1">
              <h1 className="flex items-center gap-1.5 text-xl font-extrabold tracking-tight sm:text-3xl">
                <span className="truncate">{displayName}</span>
                <BadgeCheck
                  className="size-5 shrink-0 text-brand sm:size-6"
                  aria-label={lang === "ar" ? "صفحة موثقة" : "Verified"}
                />
              </h1>
              <p
                className="mt-0.5 max-w-md truncate text-xs text-muted-foreground sm:text-sm"
                dir={lang === "ar" ? "rtl" : "ltr"}
              >
                {bio}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2.5 pb-1 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              {whatsapp && (
                <SiteButton variant="primary" asChild>
                  <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                    <WhatsAppIcon className="size-4" />
                    {lang === "ar" ? "كلمنا واتساب" : "WhatsApp us"}
                  </a>
                </SiteButton>
              )}
              <SiteButton variant="outline" asChild>
                <Link to="/shop">
                  <Store className="size-4" />
                  {lang === "ar" ? "تصفح المتجر" : "Browse shop"}
                </Link>
              </SiteButton>
            </div>

            {(socialLinks.length > 0 || email) && (
              <div className="flex flex-wrap items-center gap-2">
                {socialLinks.map(({ key, href, Icon, label }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="grid size-9 place-items-center rounded-full border border-border/60 bg-card text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-brand/60 hover:text-brand hover:shadow-[0_8px_20px_-8px_var(--brand)] active:scale-95"
                  >
                    <Icon className="size-4" />
                  </a>
                ))}
                {email && (
                  <a
                    href={`mailto:${email}`}
                    aria-label={email}
                    title={email}
                    className="grid size-9 place-items-center rounded-full border border-border/60 bg-card text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-brand/60 hover:text-brand hover:shadow-[0_8px_20px_-8px_var(--brand)] active:scale-95"
                  >
                    <Mail className="size-4" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Stats strip ── */}
        {heroStats.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 sm:px-4">
            {heroStats.map((s) => (
              <div
                key={s.l}
                className="flex flex-col rounded-2xl border border-border/60 bg-card px-4 py-3 text-center transition hover:border-brand/40 sm:py-4"
              >
                <dt className="order-2 mt-0.5 block text-[11px] text-muted-foreground sm:text-xs">
                  {s.l}
                </dt>
                <dd className="order-1 text-lg font-extrabold text-brand-deep sm:text-2xl">
                  {s.n}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* ── Products: categories first, then the feed ── */}
        <div className="py-5 sm:py-7">
          <section aria-label={lang === "ar" ? "المنتجات" : "Products"}>
            {(cats.data ?? []).length > 0 && (
              <div className="mb-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-base font-extrabold sm:text-lg">
                    <span className="h-4 w-1 rounded-full bg-brand" />
                    {lang === "ar" ? "تسوق حسب القسم" : "Shop by category"}
                  </h2>
                  <Link
                    to="/shop"
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand hover:underline sm:text-sm"
                  >
                    {lang === "ar" ? "كل الأقسام" : "All sections"}
                    <GoIcon className="size-3.5" />
                  </Link>
                </div>
                <div className="-mx-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3 pb-1 no-scrollbar sm:-mx-6 sm:gap-3 sm:px-6">
                  {(cats.data ?? []).map((c) => (
                    <CategoryChip key={c.id} c={c} count={catCounts.get(c.id)} />
                  ))}
                </div>
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                {feeds.map((f) => (
                  <SiteButton
                    key={f.id}
                    variant="filter"
                    size="filter"
                    filterActive={feed === f.id}
                    onClick={() => pickFeed(f.id)}
                  >
                    {lang === "ar" ? f.ar : f.en}
                  </SiteButton>
                ))}
                <Link
                  to="/shop"
                  className="ms-auto inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline sm:text-sm"
                >
                  {lang === "ar" ? "عرض الكل" : "View all"}
                  <GoIcon className="size-3.5" />
                </Link>
              </div>

              {feedPending ? (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4" aria-hidden>
                  {Array.from({ length: initialVisible() }).map((_, i) => (
                    <div key={i} className="h-64 animate-pulse rounded-3xl bg-card sm:h-72" />
                  ))}
                </div>
              ) : shown.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
                    {shown.map((p, i) => (
                      <ProductCard key={p.id} p={p} priority={i < 4} />
                    ))}
                  </div>
                  <div className="mt-5 text-center">
                    <p className="mb-3 text-xs text-muted-foreground tabular-nums">
                      {lang === "ar"
                        ? `عرض ${shown.length} من ${feedResolved.length}`
                        : `Showing ${shown.length} of ${feedResolved.length}`}
                    </p>
                    {hasMore ? (
                      <SiteButton
                        variant="outline"
                        size="pill"
                        onClick={() => setVisibleCount((v) => v + moreStep())}
                      >
                        {lang === "ar" ? "عرض المزيد" : "Show more"}
                        <GoIcon className="size-4 rotate-90" />
                      </SiteButton>
                    ) : (
                      feedResolved.length > 0 && (
                        <SiteButton variant="primary" size="pill" asChild>
                          <Link to="/shop">
                            <Store className="size-4" />
                            {lang === "ar" ? "عرض كل الخدمات في المتجر" : "View all in shop"}
                          </Link>
                        </SiteButton>
                      )
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {lang === "ar"
                      ? "لا توجد منتجات حالياً - تصفح المتجر"
                      : "No products yet - browse the shop"}
                  </p>
                  <Link
                    to="/shop"
                    className="mt-3 inline-block font-bold text-brand hover:underline"
                  >
                    {lang === "ar" ? "المتجر" : "Shop"}
                  </Link>
                </div>
              )}
            </section>
        </div>

        {/* ── Reviews + FAQ (always visible under products) ── */}
        <div className="border-t border-border/60">
          <Suspense
            fallback={
              <div
                className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card"
                aria-hidden
              />
            }
          >
            <Testimonials />
          </Suspense>
        </div>

        <Suspense
          fallback={
            <div
              className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card"
              aria-hidden
            />
          }
        >
          <FAQ />
        </Suspense>

        {/* ── Help band ── */}
        <section className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-l from-[#0b3fa0] via-[#0096cf] to-[#00a9e0] p-5 text-white sm:mb-10 sm:rounded-3xl sm:p-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-extrabold sm:text-2xl">
                {lang === "ar"
                  ? "محتار تختار إيه؟ سهلنالك الاختيار"
                  : "Not sure what to pick? We make it easy"}
              </h2>
              <p className="mt-1 text-xs text-white/85 sm:text-sm">
                {lang === "ar"
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
                {lang === "ar" ? "استشارة مجانية" : "Free advice"}
              </a>
            ) : (
              <Link
                to="/shop"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#0b3fa0] transition hover:brightness-95 active:scale-95"
              >
                <Store className="size-4" />
                {lang === "ar" ? "تصفح المتجر" : "Browse shop"}
              </Link>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

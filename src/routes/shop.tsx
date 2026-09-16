import { createFileRoute, Link } from "@tanstack/react-router";
import { withTimeout, CRITICAL_LOADER_TIMEOUT_MS } from "@/lib/loader-timeout";
import { healServerValue } from "@/lib/server-query-cache";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { Search, X, ArrowUpDown } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard, type ProductCardData } from "@/components/ProductCard";
import { SiteButton } from "@/components/ui/site-button";
import { useBrandSetting } from "@/hooks/useSiteSetting";
import { queryOptions } from "@tanstack/react-query";
import { matchesSearchQuery } from "@/lib/search-utils";

type ShopSearch = { q?: string; category?: string };

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>): ShopSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? String(search.q) : undefined,
    category:
      typeof search.category === "string" && search.category.trim()
        ? String(search.category)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "كل الاشتراكات | سهلنالك" },
      {
        name: "description",
        content:
          "كل الاشتراكات الرقمية في مكان واحد: ذكاء اصطناعي وتصميم وشغل وترفيه - دور باسم الخدمة أو فلتر بالقسم، وادفع بالجنيه.",
      },
      { property: "og:site_name", content: "Sahlnalk" },
      { property: "og:title", content: "كل الاشتراكات | سهلنالك" },
      {
        property: "og:description",
        content: "ذكاء اصطناعي وتصميم وشغل وترفيه - أسعار بالجنيه وتسليم فوري.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rapidkeyz.com/shop" },
      { property: "og:image", content: "https://rapidkeyz.com/cover.webp" },
      { property: "og:image:secure_url", content: "https://rapidkeyz.com/cover.webp" },
      { property: "og:image:alt", content: "متجر سهلنالك - كل الاشتراكات" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "كل الاشتراكات | سهلنالك" },
      { name: "twitter:description", content: "ذكاء اصطناعي وتصميم وشغل وترفيه - أسعار بالجنيه وتسليم فوري." },
      { name: "twitter:image", content: "https://rapidkeyz.com/cover.webp" },
    ],
    links: [{ rel: "canonical", href: "https://rapidkeyz.com/shop" }],
  }),
  // Server-render the catalog so products are visible in the first paint.
  loader: async ({ context }) => {
    const qc = context.queryClient;
    // Deadline-bounded: a slow database must never hold the blank HTML
    // response hostage. Deadline-misses are healed from the live cache or the
    // last-good server snapshot (see src/lib/server-query-cache.ts) so the
    // client never hydrates on stale nulls.
    const [categoriesRaw, productsRaw] = await Promise.all([
      withTimeout(
        qc.ensureQueryData(shopCategoriesQuery()),
        CRITICAL_LOADER_TIMEOUT_MS,
        [] as CategoryRow[],
      ),
      withTimeout(qc.ensureQueryData(shopProductsQuery()), CRITICAL_LOADER_TIMEOUT_MS, [] as any[]),
    ]);
    const categories = healServerValue("shop:categories", qc, shopCategoriesQuery().queryKey, categoriesRaw, [] as CategoryRow[]);
    const products = healServerValue("shop:products", qc, shopProductsQuery().queryKey, productsRaw, [] as any[]);
    return { categories, products };
  },
  component: ShopPage,
});

type CategoryRow = { id: string; slug: string; name_ar: string | null; name_en: string | null };

function mapProduct(p: any): ProductCardData {
  const active = (p.product_plans ?? []).filter((pl: any) => pl.is_active);
  const cheapest = [...active].sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];
  const totalStock = active.reduce(
    (s: number, pl: any) => s + Math.max(0, Number(pl.stock ?? 0)),
    0,
  );
  const compare = cheapest ? Number(cheapest.compare_price ?? 0) : 0;
  return {
    id: p.id,
    slug: p.slug,
    name_ar: p.name_ar,
    name_en: p.name_en,
    short_description_ar: p.short_description_ar ?? null,
    short_description_en: p.short_description_en ?? null,
    description_ar: p.description_ar,
    description_en: p.description_en,
    icon_url: p.icon_url,
    cover_url: p.cover_url ?? null,
    delivery_type: p.delivery_type,
    account_type: p.account_type,
    discount_percent: p.discount_percent,
    minPrice: cheapest ? Number(cheapest.price) : null,
    cheapestPlanId: cheapest?.id ?? null,
    planLabel_ar: cheapest?.label_ar ?? null,
    planLabel_en: cheapest?.label_en ?? null,
    totalStock,
    cheapestPlanComparePrice: compare > 0 ? compare : null,
  };
}

const PRODUCT_SELECT =
  "id, slug, name_ar, name_en, short_description_ar, short_description_en, description_ar, description_en, icon_url, cover_url, delivery_type, account_type, discount_percent, category_id, category_ids, sort_order, product_plans(id, price, compare_price, label_ar, label_en, is_active, sort_order, stock)";

const shopCategoriesQuery = () =>
  queryOptions({
    queryKey: ["shop-categories"] as const,
    queryFn: async (): Promise<CategoryRow[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_ar, name_en, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
  });

const shopProductsQuery = () =>
  queryOptions({
    queryKey: ["shop-products"] as const,
    queryFn: async (): Promise<any[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
  });

function ShopPage() {
  const { lang } = useApp();
  const isAr = lang === "ar";
  const brand = useBrandSetting();
  const coverSrc = (brand.data?.cover_url ?? "").trim() || "/cover.webp";
  // Profile picture tile: settings avatar first, bundled fallback second.
  const avatarSrc = (brand.data?.avatar_url ?? "").trim() || "/pp.webp";
  const { q, category } = Route.useSearch();
  const initial = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const [term, setTerm] = useState(q ?? "");
  const [sort, setSort] = useState<"pop" | "cheap" | "exp">("pop");
  // Live search: filter as you type (debounced), no Enter needed.
  const [liveQ, setLiveQ] = useState(q ?? "");

  useEffect(() => {
    setTerm(q ?? "");
    setLiveQ(q ?? "");
  }, [q]);

  useEffect(() => {
    const id = setTimeout(() => setLiveQ(term), 200);
    return () => clearTimeout(id);
  }, [term]);

  const categories = useQuery({
    ...shopCategoriesQuery(),
    // Only seed when the loader actually had data: an empty fallback array
    // would be treated as fresh and the grid would flash "no services"
    // before the background refetch fills it in.
    ...(initial.categories?.length ? { initialData: initial.categories } : {}),
  });

  const products = useQuery({
    ...shopProductsQuery(),
    ...(initial.products?.length ? { initialData: initial.products } : {}),
  });

  const activeCategory = useMemo(
    () => (categories.data ?? []).find((c) => c.slug === category) ?? null,
    [categories.data, category],
  );

  const visible = useMemo(() => {
    const rows = products.data ?? [];
    const list = rows
      .filter((p: any) => {
        if (activeCategory) {
          const ids: string[] = Array.isArray(p.category_ids) ? p.category_ids : [];
          if (p.category_id !== activeCategory.id && !ids.includes(activeCategory.id)) return false;
        } else if (category && !activeCategory) {
          // Unknown category slug , show nothing rather than everything.
          return false;
        }
        if (liveQ && liveQ.trim()) {
          // Match by product name only (ar + en).
          const hay = [p.name_ar, p.name_en].filter(Boolean).join(" ");
          if (!matchesSearchQuery(hay, liveQ)) return false;
        }
        return true;
      })
      .map(mapProduct);
    if (sort === "cheap") list.sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
    if (sort === "exp") list.sort((a, b) => (b.minPrice ?? -Infinity) - (a.minPrice ?? -Infinity));
    return list;
  }, [products.data, activeCategory, category, liveQ, sort]);

  const setCategory = (slug?: string) => {
    navigate({ search: (prev: ShopSearch) => ({ ...prev, category: slug }), replace: true });
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({
      search: (prev: ShopSearch) => ({ ...prev, q: term.trim() || undefined }),
      replace: true,
    });
  };

  // Smart loading: skeletons only when there is truly nothing to show yet.
  // Background refetches (isFetching with data present) keep the current grid
  // on screen and just show a thin progress hint — never a repaint.
  const hasData = (products.data?.length ?? 0) > 0 || (categories.data?.length ?? 0) > 0;
  const loading = (products.isLoading || categories.isLoading) && !hasData;
  const refreshing =
    !loading && (products.isFetching || categories.isFetching) && hasData;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1">
        {/* ── Collection cover ── */}
        <div className="mx-auto w-full max-w-6xl px-3 sm:px-6">
          <div className="relative mt-3 overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] sm:mt-5 sm:rounded-3xl">
            <img
              src={coverSrc}
              alt=""
              aria-hidden
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="h-28 w-full object-cover sm:h-40"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/45 via-[#0b3fa0]/10 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3 sm:gap-4 sm:p-5">
              <img
                src={avatarSrc}
                alt={isAr ? "سهلنالك" : "Sahlnalk"}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="size-12 shrink-0 rounded-xl bg-white object-cover shadow-lg ring-2 ring-white sm:size-16"
              />
              <div className="min-w-0 pb-0.5 text-white">
                <h1 className="truncate text-lg font-extrabold drop-shadow sm:text-2xl">
                  {activeCategory
                    ? (isAr ? activeCategory.name_ar : activeCategory.name_en) ||
                    activeCategory.slug
                    : isAr
                      ? "كل الاشتراكات"
                      : "All subscriptions"}
                </h1>
                <p className="text-[11px] text-white/85 sm:text-xs">
                  {loading
                    ? "…"
                    : isAr
                      ? `${visible.length} خدمة • تسليم فوري`
                      : `${visible.length} services • instant delivery`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Sticky filter bar ── */}
        <div
          className="sticky z-30 mt-3 border-y border-border/60 bg-card/95 backdrop-blur-md sm:mt-4"
          style={{ top: "var(--app-header-h, 56px)" }}
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-2.5 sm:px-6">
            <div className="flex items-center gap-2">
              <form onSubmit={submitSearch} className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 size-4 text-muted-foreground" />
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder={isAr ? "دوّر على خدمة..." : "Search services..."}
                  className="w-full rounded-full border border-border bg-card py-2.5 ps-9 pe-9 text-sm outline-none transition-colors focus:border-brand"
                />
                {term && (
                  <button
                    type="button"
                    aria-label={isAr ? "مسح البحث" : "Clear search"}
                    onClick={() => {
                      setTerm("");
                      setLiveQ("");
                      navigate({
                        search: (prev: ShopSearch) => ({ ...prev, q: undefined }),
                        replace: true,
                      });
                    }}
                    className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </form>
              <label className="relative inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2.5 text-xs font-bold text-muted-foreground transition hover:border-brand/50">
                <ArrowUpDown className="size-3.5" />
                <span className="sr-only">{isAr ? "ترتيب" : "Sort"}</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  className="cursor-pointer appearance-none bg-transparent pe-1 outline-none"
                  aria-label={isAr ? "ترتيب" : "Sort"}
                >
                  <option value="pop">{isAr ? "الأشهر" : "Popular"}</option>
                  <option value="cheap">{isAr ? "الأرخص" : "Cheapest"}</option>
                  <option value="exp">{isAr ? "الأغلى" : "Priciest"}</option>
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <SiteButton
                variant="filter"
                size="filter"
                filterActive={!category}
                onClick={() => setCategory(undefined)}
                className="shrink-0"
              >
                {isAr ? "الكل" : "All"}
              </SiteButton>
              {(categories.data ?? []).map((c) => (
                <SiteButton
                  key={c.id}
                  variant="filter"
                  size="filter"
                  filterActive={category === c.slug}
                  onClick={() => setCategory(category === c.slug ? undefined : c.slug)}
                  className="shrink-0"
                >
                  {isAr ? c.name_ar : c.name_en}
                </SiteButton>
              ))}
            </div>
          </div>
        </div>

        <section className="max-w-6xl mx-auto px-3 sm:px-6 pb-16 pt-5">
          <div
            aria-hidden
            className={`h-0.5 overflow-hidden rounded-full transition-opacity ${refreshing ? "opacity-100" : "opacity-0"}`}
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
          </div>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-64 rounded-2xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-muted-foreground text-sm">
                {isAr ? "لا توجد خدمات مطابقة لبحثك." : "No services match your search."}
              </p>
              <Link to="/shop" search={{}} className="text-brand font-bold hover:underline text-sm">
                {isAr ? "عرض كل الخدمات" : "Show all services"}
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {visible.map((p, i) => (
                <ProductCard key={p.id} p={p} priority={i < 6} />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

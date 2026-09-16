import { queryOptions } from "@tanstack/react-query";
import type { ProductCardData } from "@/components/ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { withQueryFallback } from "@/lib/loader-timeout";

/**
 * Shared query definitions for every public surface (home page, shop, footer).
 *
 * Why this file exists:
 * - The query keys live in ONE place, so the route loader can prefetch exactly
 *   the same cache entries the components subscribe to. Any key drift means the
 *   component refetches on mount and the user sees content popping in after the
 *   splash screen disappears.
 * - The keys are kept identical to the previous inline ones so the realtime
 *   listener (`usePublicRealtime`) keeps invalidating them.
 */

/** Everything on the home page is cached this long before a background refresh.
 * Because usePublicRealtime invalidates cache instantly on any admin edit,
 * we keep staleTime high (30 min) to avoid redundant Supabase API egress. */
export const PUBLIC_STALE_TIME = 30 * 60_000;

export type PublicCategory = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  icon: string | null;
  description_ar: string | null;
  description_en: string | null;
};

export type BrandItem = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  loading_icon_url: string | null;
};

export type TestimonialImage = { id: string; image_url: string };

export type PublicFaq = {
  question_ar: string;
  question_en: string;
  answer_ar: string;
  answer_en: string;
};

export type CategoryRow = {
  id: string;
  slug: string;
  name_ar: string | null;
  name_en: string | null;
  products: ProductCardData[];
};

const CATEGORY_ROW_PRODUCT_SELECT =
  "id, slug, name_ar, name_en, icon_url, cover_url, delivery_type, account_type, discount_percent, product_plans(id, price, compare_price, label_ar, label_en, is_active, sort_order, stock)";

/* -------------------------------------------------------------------------- */
/* Fetchers                                                                    */
/* -------------------------------------------------------------------------- */

export async function fetchCategories(slugs?: string[]): Promise<PublicCategory[]> {
  let q = supabase
    .from("categories")
    .select("id, slug, name_ar, name_en, icon, description_ar, description_en")
    .eq("is_active", true)
    .order("sort_order");
  if (slugs && slugs.length) q = q.in("slug", slugs);
  const { data } = await q;
  return (data ?? []) as PublicCategory[];
}

export async function fetchFooterCategories(): Promise<PublicCategory[]> {
  const { data } = await supabase
    .from("categories")
    .select("id, slug, name_ar, name_en")
    .eq("is_active", true)
    .order("sort_order")
    .limit(6);
  return (data ?? []) as PublicCategory[];
}

export async function fetchBrands(): Promise<BrandItem[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name_ar, name_en, loading_icon_url")
    .eq("status", "active")
    .not("loading_icon_url", "is", null)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(40);
  if (error) throw error;
  return (data ?? []) as BrandItem[];
}

export async function fetchTestimonialImages(): Promise<TestimonialImage[]> {
  const { data, error } = await supabase
    .from("testimonial_images")
    .select("id, image_url")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TestimonialImage[];
}

export async function fetchPublicFaqs(): Promise<PublicFaq[]> {
  const { data } = await supabase
    .from("faqs")
    .select("question_ar, question_en, answer_ar, answer_en")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []) as PublicFaq[];
}

export async function fetchCategoryRows(slugs?: string[]): Promise<CategoryRow[]> {
  let q = supabase
    .from("categories")
    .select("id, slug, name_ar, name_en, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (slugs && slugs.length) q = q.in("slug", slugs);
  else q = q.limit(4);
  const { data: cats, error } = await q;
  if (error) throw error;

  const rows = await Promise.all(
    (cats ?? []).map(async (c) => {
      const { data: prods } = await supabase
        .from("products")
        .select(CATEGORY_ROW_PRODUCT_SELECT)
        .eq("status", "active")
        .or(`category_id.eq.${c.id},category_ids.cs.{${c.id}}`)
        .order("sort_order", { ascending: true })
        .limit(8);

      const mapped: ProductCardData[] = (prods ?? []).map((p: any) => {
        const active = (p.product_plans ?? []).filter((pl: any) => pl.is_active);
        const cheapest = [...active].sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];
        const totalStock = active.reduce(
          (s: number, pl: any) => s + Math.max(0, Number(pl.stock ?? 0)),
          0,
        );
        const cheapestPlanComparePrice = cheapest ? Number(cheapest.compare_price ?? 0) : 0;
        return {
          id: p.id,
          slug: p.slug,
          name_ar: p.name_ar,
          name_en: p.name_en,
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
          cheapestPlanComparePrice: cheapestPlanComparePrice > 0 ? cheapestPlanComparePrice : null,
        } as ProductCardData;
      });

      return { id: c.id, slug: c.slug, name_ar: c.name_ar, name_en: c.name_en, products: mapped };
    }),
  );

  // Preserve requested slug order if provided
  const ordered =
    slugs && slugs.length
      ? (slugs.map((s) => rows.find((r) => r.slug === s)).filter(Boolean) as CategoryRow[])
      : rows;
  return ordered.filter((r) => r.products.length > 0);
}

/* -------------------------------------------------------------------------- */
/* Query options , the single source of truth for keys                         */
/* -------------------------------------------------------------------------- */

export const categoriesShowcaseQuery = (slugs?: string[]) =>
  queryOptions({
    queryKey: ["cats-showcase", slugs?.join(",") ?? "all"] as const,
    queryFn: withQueryFallback(() => fetchCategories(slugs), [] as PublicCategory[]),
    staleTime: PUBLIC_STALE_TIME,
  });

export const footerCategoriesQuery = () =>
  queryOptions({
    queryKey: ["footer-categories"] as const,
    queryFn: withQueryFallback(fetchFooterCategories, [] as PublicCategory[]),
    staleTime: PUBLIC_STALE_TIME,
  });

export const brandsStripQuery = () =>
  queryOptions({
    queryKey: ["brands-strip"] as const,
    queryFn: withQueryFallback(fetchBrands, [] as BrandItem[]),
    staleTime: PUBLIC_STALE_TIME,
  });

export const testimonialImagesQuery = () =>
  queryOptions({
    queryKey: ["testimonial-images"] as const,
    queryFn: withQueryFallback(fetchTestimonialImages, [] as TestimonialImage[]),
    staleTime: PUBLIC_STALE_TIME,
  });

export const publicFaqsQuery = () =>
  queryOptions({
    queryKey: ["public-faqs"] as const,
    queryFn: withQueryFallback(fetchPublicFaqs, [] as PublicFaq[]),
    staleTime: PUBLIC_STALE_TIME,
  });

export const categoryRowsQuery = (slugs?: string[]) =>
  queryOptions({
    queryKey: ["category-rows", slugs?.join(",") ?? "top4"] as const,
    queryFn: withQueryFallback(() => fetchCategoryRows(slugs), [] as CategoryRow[]),
    staleTime: PUBLIC_STALE_TIME,
  });

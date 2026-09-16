import { queryOptions } from "@tanstack/react-query";
import type { ProductCardData } from "@/components/ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { withQueryFallback } from "@/lib/loader-timeout";

const PRODUCT_SELECT =
  "id, slug, name_ar, name_en, icon_url, cover_url, delivery_type, account_type, discount_percent, is_bestseller, category_id, category_ids, product_plans(id, price, compare_price, stock, label_ar, label_en, is_active, sort_order)";

export function mapProductRow(p: any): ProductCardData {
  const activePlans = (p.product_plans ?? []).filter((pl: any) => pl.is_active);
  const totalStock = activePlans.reduce(
    (s: number, pl: any) => s + Math.max(0, Number(pl.stock ?? 0)),
    0,
  );
  const inStock = activePlans.filter((pl: any) => Number(pl.stock ?? 0) > 0);
  const cheapest = (inStock.length ? inStock : activePlans).sort(
    (a: any, b: any) => Number(a.price) - Number(b.price),
  )[0];
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
    discount_percent: p.discount_percent ?? 0,
    minPrice: cheapest ? Number(cheapest.price) : null,
    cheapestPlanId: cheapest?.id ?? null,
    planLabel_ar: cheapest?.label_ar ?? null,
    planLabel_en: cheapest?.label_en ?? null,
    totalStock,
    cheapestPlanComparePrice: cheapestPlanComparePrice > 0 ? cheapestPlanComparePrice : null,
  };
}

export async function fetchAllProducts(): Promise<(ProductCardData & { category_id?: string | null; category_ids?: string[] })[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p: any) => ({ ...mapProductRow(p), category_id: p.category_id ?? null, category_ids: p.category_ids ?? [] }));
}

export async function fetchFeaturedProducts(): Promise<ProductCardData[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(9);
  if (error) throw error;
  return (data ?? []).map(mapProductRow);
}

export async function fetchBestSellers(): Promise<ProductCardData[]> {
  const { data: manual } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .eq("is_bestseller", true)
    .order("sort_order", { ascending: true })
    .limit(12);
  const manualList = (manual ?? []).map(mapProductRow);
  if (manualList.length >= 4) return manualList.slice(0, 8);

  const { data: items } = await supabase
    .from("order_items")
    .select("product_id, quantity, orders!inner(status)")
    .in("orders.status", ["paid", "delivered"]);
  const counts = new Map<string, number>();
  for (const it of (items ?? []) as any[]) {
    if (!it.product_id) continue;
    counts.set(it.product_id, (counts.get(it.product_id) ?? 0) + Number(it.quantity ?? 1));
  }
  const excludeIds = new Set(manualList.map((p) => p.id));
  const topIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter((id) => !excludeIds.has(id))
    .slice(0, 8 - manualList.length);
  if (topIds.length === 0) return manualList;

  const { data } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .in("id", topIds)
    .eq("status", "active");
  const byId = new Map((data ?? []).map((p: any) => [p.id, p]));
  const autoList = topIds.flatMap((id) => {
    const p: any = byId.get(id);
    return p ? [mapProductRow(p)] : [];
  });
  return [...manualList, ...autoList];
}

export async function fetchSiteSetting<T = Record<string, any>>(key: string): Promise<T | null> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value ?? null) as T | null;
}

export const featuredProductsQuery = () =>
  queryOptions({
    queryKey: ["featured-products"] as const,
    queryFn: withQueryFallback(fetchFeaturedProducts, [] as ProductCardData[]),
    staleTime: 5 * 60_000,
  });

export const bestSellersQuery = () =>
  queryOptions({
    queryKey: ["best-sellers"] as const,
    queryFn: withQueryFallback(fetchBestSellers, [] as ProductCardData[]),
    staleTime: 5 * 60_000,
  });

export const allProductsQuery = () =>
  queryOptions({
    queryKey: ["all-products"] as const,
    queryFn: withQueryFallback(fetchAllProducts, [] as ProductCardData[]),
    staleTime: 5 * 60_000,
  });

export const siteSettingQuery = <T = Record<string, any>>(key: string) =>
  queryOptions({
    queryKey: ["site-settings", key] as const,
    queryFn: withQueryFallback(() => fetchSiteSetting<T>(key), null as T | null),
    staleTime: 5 * 60_000,
  });

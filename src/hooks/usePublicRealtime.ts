import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeTables } from "@/lib/realtime";

/**
 * Site-wide realtime for public surfaces (product pages, shop, home, dashboard).
 * Listens for data changes and invalidates React Query caches (debounced)
 * so any change reflects instantly without a manual refresh:
 * - catalog (products, plans, categories, reviews, faqs, settings, testimonials)
 * - own account (profiles) and own commerce state (orders, items, refunds),
 *   delivered RLS-side so each user only receives their own rows.
 *
 * The shared subscriber also revalidates after socket reconnects and when
 * the tab becomes visible, so nothing stays stale.
 */
const TABLES = [
  "product_plans",
  "products",
  "site_settings",
  "testimonial_images",
  "categories",
  "faqs",
  "product_reviews",
  "profiles",
  "orders",
  "order_items",
  "refunds",
  "coupons",
] as const;

export function usePublicRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    return subscribeTables(qc, "public-realtime-stock", TABLES, 200);
  }, [qc]);
}

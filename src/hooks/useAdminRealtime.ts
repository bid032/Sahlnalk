import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeTables } from "@/lib/realtime";

/**
 * Global realtime subscription for admin dashboard.
 * Listens to every table used across admin pages and invalidates React Query
 * caches so any change (from any admin, staff, or customer action) reflects
 * instantly without a manual refresh.
 *
 * The shared subscriber also revalidates after socket reconnects and when
 * the tab becomes visible, so the dashboard never shows stale numbers.
 */
const TABLES = [
  "orders",
  "order_items",
  "products",
  "product_plans",
  "plan_costs",
  "categories",
  "coupons",
  "coupon_redemptions",
  "refunds",
  "faqs",
  "testimonial_images",
  "product_reviews",
  "user_roles",
  "profiles",
  "site_settings",
  "account_inventory",
  "delivered_accounts",
  "audit_log",
] as const;

export function useAdminRealtime(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    return subscribeTables(qc, "admin-realtime-global", TABLES, 250);
  }, [enabled, qc]);
}

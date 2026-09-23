import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resilient table subscription shared by every realtime hook.
 *
 * Smart invalidation: a change in one table only refetches the query keys
 * that actually read from it. The old behaviour (invalidateQueries() with no
 * filter) refetched EVERYTHING — catalog, settings, orders, reviews — on any
 * single admin keystroke, which is exactly the "page flashes and repaints"
 * feeling. Targeted invalidation keeps unrelated sections untouched.
 *
 * - any insert/update/delete → debounced targeted invalidation (~250ms),
 * - socket drop / reconnect → targeted revalidation of the affected tables,
 * - background tab / offline → refetch only stale queries on visible/online
 *   (fresh cache is left alone, so returning to the tab never blanks).
 */

/** Table → queryKey heads that read from it. Keep in sync with query defs. */
const TABLE_KEY_MAP: Record<string, readonly string[]> = {
  products: [
    "product",
    "featured-products",
    "best-sellers",
    "all-products",
    "shop-products",
    "related",
    "category-rows",
    "cats-showcase",
    "brands-strip",
  ],
  product_plans: [
    "product",
    "featured-products",
    "best-sellers",
    "all-products",
    "shop-products",
    "related",
    "category-rows",
  ],
  categories: ["shop-categories", "cats-showcase", "category-rows", "footer-categories"],
  site_settings: ["site-settings"],
  faqs: ["public-faqs"],
  product_reviews: ["product", "reviews", "product-reviews"],
  testimonial_images: ["testimonial-images"],
  profiles: ["profile", "profiles", "admin"],
  orders: ["orders", "my-orders", "best-sellers", "admin"],
  order_items: ["orders", "my-orders", "order-items", "best-sellers", "admin"],
  refunds: ["refunds", "orders", "my-orders", "admin"],
  coupons: ["coupons", "product-coupons", "admin"],
};

function keysForTables(tables: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const t of tables) {
    for (const k of TABLE_KEY_MAP[t] ?? []) out.add(k);
  }
  return out;
}

export function subscribeTables(
  qc: QueryClient,
  channelName: string,
  tables: readonly string[],
  debounceMs = 250,
): () => void {
  if (typeof window === "undefined") return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let wasDown = false;
  let disposed = false;
  // Tables with pending changes since the last flush.
  const dirty = new Set<string>();

  const flush = () => {
    timer = null;
    if (disposed) return;
    if (dirty.size === 0) return;
    const heads = keysForTables(dirty);
    dirty.clear();
    if (heads.size === 0) return;
    // Targeted: only queries whose key head maps to a dirty table refetch.
    // Components keep rendering cached data; the network updates silently.
    void qc.invalidateQueries({
      predicate: (q) => {
        const head = q.queryKey?.[0];
        return typeof head === "string" && heads.has(head);
      },
      // Active (mounted) queries refetch now; inactive ones wait until mount.
      refetchType: "active",
    });
  };

  const schedule = (tablesToMark: Iterable<string>, immediate = false) => {
    if (disposed) return;
    for (const t of tablesToMark) dirty.add(t);
    if (immediate) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
      return;
    }
    if (timer) return;
    timer = setTimeout(flush, debounceMs);
  };

  const topic = `${channelName}-${Math.random().toString(36).substring(2, 9)}`;
  const channel = supabase.channel(topic);
  for (const table of tables) {
    channel.on("postgres_changes" as any, { event: "*", schema: "public", table }, () =>
      schedule([table]),
    );
  }

  channel.subscribe((status) => {
    if (disposed) return;
    if (status === "SUBSCRIBED") {
      // Reconnected after a drop → catch up only on affected tables.
      if (wasDown) {
        wasDown = false;
        if (dirty.size > 0) schedule([], true);
      }
    } else if (status === "TIMED_OUT" || status === "CLOSED" || status === "CHANNEL_ERROR") {
      wasDown = true;
    }
  });

  const onVisible = () => {
    // Returning to the tab: only stale queries refetch (fresh cache untouched).
    if (document.visibilityState === "visible") {
      void qc.refetchQueries({ type: "active", stale: true });
    }
  };
  const onOnline = () => {
    void qc.refetchQueries({ type: "active", stale: true });
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    dirty.clear();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    supabase.removeChannel(channel);
  };
}

import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Monotonic-cache guard ("sticky good data").
 *
 * Problem it kills: a mounted section (WhatsApp button, socials, category
 * counts, product feed) renders with real data, then seconds later reverts to
 * empty — with no navigation and no user interaction. The trigger varies
 * (slow-dev loader race, HMR reload, realtime refetch failure, pool timeout),
 * but the mechanism is always the same: a background success writes an empty
 * value (null / [] / {}) over good cached data.
 *
 * This guard remembers the last non-empty value of every protected query and
 * vetoes any downgrade while the query is mounted (has observers): the good
 * value is restored synchronously, so React never paints the empty state.
 * Fresh mounts are unaffected (no memory → empty is allowed → skeletons show
 * → the fetch fills them), and genuine updates pass through untouched because
 * only *empty* results are vetoed.
 */

/** Query-key heads whose mounted UI must never regress to empty. */
const PROTECTED_HEADS: ReadonlySet<string> = new Set([
  "site-settings",
  "best-sellers",
  "all-products",
  "featured-products",
  "shop-products",
  "shop-categories",
  "cats-showcase",
  "brands-strip",
  "category-rows",
  "testimonial-images",
  "public-faqs",
  "footer-categories",
]);

function keyHash(key: QueryKey): string {
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length === 0;
  return false;
}

type CacheQuery = {
  queryKey: QueryKey;
  state?: { data?: unknown };
  getObserversCount?: () => number;
};

export function installStickyCacheGuard(qc: QueryClient): () => void {
  const lastGood = new Map<string, unknown>();
  const cache = qc.getQueryCache();

  const record = (query: CacheQuery) => {
    const data = query.state?.data;
    if (!isEmptyValue(data)) lastGood.set(keyHash(query.queryKey), data);
  };

  const unsubscribe = cache.subscribe((event) => {
    const query = (event as { query?: CacheQuery }).query;
    if (!query) return;
    const head = query.queryKey?.[0];
    if (typeof head !== "string" || !PROTECTED_HEADS.has(head)) return;

    if (event.type === "observerAdded") {
      // Mount with (loader/dehydrated) data → remember it as the baseline.
      record(query);
      return;
    }
    if (event.type === "observerRemoved") {
      // Nobody watches anymore → forget, so a future fresh mount is free to
      // legitimately render empty (e.g. store truly emptied).
      if (query.getObserversCount?.() === 0) lastGood.delete(keyHash(query.queryKey));
      return;
    }
    if (event.type !== "updated") return;

    const data = query.state?.data;
    if (!isEmptyValue(data)) {
      record(query);
      return;
    }
    // Empty write while mounted → veto: restore last good synchronously.
    // (The nested setQueryData re-enters this subscriber once with good data
    // and becomes a no-op, so there is no loop.)
    if (query.getObserversCount?.() === 0) {
      lastGood.delete(keyHash(query.queryKey));
      return;
    }
    const good = lastGood.get(keyHash(query.queryKey));
    if (good !== undefined && !isEmptyValue(good)) {
      qc.setQueryData(query.queryKey, good);
    }
  });

  return () => {
    unsubscribe();
    lastGood.clear();
  };
}

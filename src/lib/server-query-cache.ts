import type { QueryClient } from "@tanstack/react-query";

/**
 * Server last-good snapshots.
 *
 * Proven by SSR inspection: route loaders race Supabase with a ~2.5s deadline
 * (`withTimeout(..., null/[])`). In slow environments the heaviest queries
 * (all-products) or unlucky ones (socials/contact) deterministically lose, so
 * the loader returns null/[] fallbacks — while the underlying
 * `ensureQueryData` promise resolves a second later and fills the query cache
 * (the SSR components DO render with full data from that late cache!).
 * The stale loaderData (nulls) then poisons client hydration: sections render
 * and later "disappear" when the client state settles on the stale snapshot.
 *
 * This module keeps a tiny in-memory last-good snapshot per query key. Loader
 * deadline-misses are healed from (in order):
 *   1. the live query cache (a late arrival may have landed after the loader
 *      variable was already assigned its fallback),
 *   2. the last-good snapshot from a previous winning request,
 *   3. the original empty fallback (cold start, truly empty store).
 * Every win refreshes the snapshot, so it never serves anything older than
 * SERVER_SNAPSHOT_TTL_MS — and the client's realtime layer corrects any
 * residual staleness within ~250ms anyway.
 */

const SERVER_SNAPSHOT_TTL_MS = 2 * 60_000;
const SERVER_SNAPSHOT_MAX = 200;

type Entry = { at: number; value: unknown };
const snapshots = new Map<string, Entry>();

function isUsable(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length > 0;
  return true;
}

function readSnapshot<T>(key: string): T | undefined {
  const e = snapshots.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > SERVER_SNAPSHOT_TTL_MS) {
    snapshots.delete(key);
    return undefined;
  }
  return e.value as T;
}

function writeSnapshot(key: string, value: unknown): void {
  if (snapshots.size >= SERVER_SNAPSHOT_MAX) {
    const oldest = snapshots.keys().next();
    if (!oldest.done) snapshots.delete(oldest.value);
  }
  snapshots.set(key, { at: Date.now(), value });
}

/**
 * Heal one loader value after a deadline race. `value` is whatever the loader
 * variable holds (possibly a timeout fallback); `queryKey` is the React Query
 * key of the same data (for late-arrival pickup).
 */
export function healServerValue<T>(
  snapshotKey: string,
  qc: QueryClient | undefined,
  queryKey: readonly unknown[],
  value: T,
  fallback: T,
): T {
  if (isUsable(value)) {
    writeSnapshot(snapshotKey, value);
    return value;
  }
  // The ensureQueryData promise may have resolved after the fallback was
  // assigned — the live cache is then newer than the loader variable.
  try {
    const late = qc?.getQueryData<T>(queryKey as never);
    if (isUsable(late)) {
      writeSnapshot(snapshotKey, late);
      return late as T;
    }
  } catch {
    /* cache unreadable — fall through */
  }
  const snap = readSnapshot<T>(snapshotKey);
  if (isUsable(snap)) return snap as T;
  return fallback;
}

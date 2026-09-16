/**
 * Route-loader guards.
 *
 * A route loader blocks the SSR response: the browser gets ZERO bytes (blank
 * tab, not even the splash) until every awaited promise settles. On shared
 * hosting (cPanel/Passenger) the first request also pays a Node cold start,
 * so one slow Supabase call turns into 10,20s of white screen.
 *
 * Rule: never let a loader await something without a deadline, and never
 * await below-the-fold data at all.
 */

/** Resolve with `fallback` if `promise` is slower than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (v: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(fallback), ms);
    promise.then(done, () => done(fallback));
  });
}

/**
 * Warm the cache without blocking the response.
 * On the server the work is simply abandoned when the HTML is flushed; the
 * client refetches these keys itself, so nothing is lost except the wait.
 */
export function warmInBackground(promises: Array<Promise<unknown>>): void {
  for (const p of promises) void Promise.resolve(p).catch(() => {});
}

/** Max time a loader may block the first paint. Reduced for "instant" feel. */
export const CRITICAL_LOADER_TIMEOUT_MS = 2500;

/** Max time any below-the-hero query may hang before we render its fallback. */
export const QUERY_TIMEOUT_MS = 8000;

/**
 * Wrap a fetcher so a slow/hanging Supabase call resolves with a safe fallback
 * instead of leaving a section stuck on its skeleton forever.
 */
export function withQueryFallback<T>(
  fetcher: () => Promise<T>,
  fallback: T,
  ms: number = QUERY_TIMEOUT_MS,
): () => Promise<T> {
  return () => withTimeout(Promise.resolve().then(fetcher), ms, fallback);
}


import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installStickyCacheGuard } from "./lib/sticky-cache";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Smart-cache feel: loader/SSR data paints instantly from cache and
        // stays on screen while a background refetch happens. Nothing ever
        // blanks the page for a refetch:
        // - fresh cache (<= staleTime) is reused as-is, no network at all,
        // - stale cache still renders first, network updates it silently,
        // - structural sharing keeps referential equality so lists don't
        //   re-render when the payload is unchanged.
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        // Only refetch on mount when there is nothing (or nothing-but-null) to
        // show. `null` seeds come from loader deadline-fallbacks and must NOT
        // count as data — otherwise the query freezes on empty forever and
        // sections (WhatsApp button, socials, stats) vanish permanently.
        // With placeholderData/keepPreviousData in the pages, even a stale
        // mount keeps the old list visible instead of flashing skeletons.
        refetchOnMount: (query) =>
          query.state.data === undefined || query.state.data === null,
        refetchOnReconnect: true,
        retry: 1,
        structuralSharing: true,
      },
    },
  });

  // Monotonic-data guard: a mounted section can never regress from good data
  // to an empty value (the "buttons appear then vanish seconds later" bug).
  // See src/lib/sticky-cache.ts.
  installStickyCacheGuard(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Intent preloading stays on (instant navigations), but with sane guards:
    // a small hover delay so stray mouse passes don't fire loaders, and a
    // 30s preload-stale window so hovering the same link twice doesn't
    // re-run its loader and flash a pending state.
    defaultPreload: "intent",
    defaultPreloadDelay: 150,
    defaultPreloadStaleTime: 30_000,
    // Keep the previous page visible while the next loader resolves instead
    // of dropping to a blank pending view.
    defaultPendingMs: 300,
    defaultPendingMinMs: 0,
  });

  return router;
};

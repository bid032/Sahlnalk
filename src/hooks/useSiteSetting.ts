import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reads one row from `site_settings` by key.
 *
 * The query key intentionally starts with "site-settings" so the site-wide
 * realtime listener (`usePublicRealtime`) invalidates it the moment an admin
 * saves anything in the dashboard -every public surface stays in sync with
 * the dashboard without a page refresh.
 */
export function useSiteSetting<T = Record<string, any>>(key: string, initialData?: T | null) {
  // NOTE: a `null` seed is deliberately NOT passed as initialData. Loaders use
  // a deadline fallback of `null` when Supabase is slow; seeding that would
  // freeze the query on "no data" forever (null counts as valid cache and
  // nothing ever refetches it). Leaving it undefined forces a background
  // refetch that fills the real value in a second later.
  const seed = initialData ?? undefined;
  return useQuery({
    queryKey: ["site-settings", key],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      return (data?.value ?? null) as T | null;
    },
    ...(seed !== undefined ? { initialData: seed as T | null } : {}),
    // Long stale window + previous-data retention: mounts reuse the cached
    // value instantly and background refetches never blank the UI. Dashboard
    // edits still arrive fast via targeted realtime invalidation.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
  });
}

/** Convenience: the `brand` setting (name + tagline per language + imagery). */
export type BrandSetting = {
  name_ar?: string;
  name_en?: string;
  tagline_ar?: string;
  tagline_en?: string;
  cover_url?: string;
  avatar_url?: string;
};

export function useBrandSetting(initialData?: BrandSetting | null) {
  return useSiteSetting<BrandSetting>("brand", initialData);
}

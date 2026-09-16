import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { initOrUpdateMetaPixel } from "@/lib/meta-pixel";

export function MetaPixelManager() {
  const { data: pixelId } = useQuery({
    queryKey: ["site-settings", "meta_pixel_id"],
    queryFn: async (): Promise<string> => {
      try {
        const { data } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", "meta_pixel_id")
          .maybeSingle();

        if (data?.value && typeof data.value === "string" && data.value.trim()) {
          return data.value.trim();
        }
      } catch (e) {
        console.warn("Failed to fetch meta_pixel_id from site_settings:", e);
      }
      return (import.meta.env.VITE_META_PIXEL_ID as string) || "";
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (pixelId && pixelId.trim()) {
      initOrUpdateMetaPixel(pixelId.trim());
    }
  }, [pixelId]);

  if (!pixelId || !pixelId.trim()) return null;

  return (
    <noscript>
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        alt=""
        src={`https://www.facebook.com/tr?id=${encodeURIComponent(pixelId.trim())}&ev=PageView&noscript=1`}
      />
    </noscript>
  );
}

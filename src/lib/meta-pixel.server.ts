import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_PIXEL_ID = "";

export type CAPIEventData = {
  eventName: string;
  eventId?: string;
  sourceUrl?: string;
  userEmail?: string;
  userPhone?: string;
  customData?: Record<string, any>;
};

/**
 * Send event to Meta Conversions API (CAPI)
 */
export async function sendCapiEvent(event: CAPIEventData) {
  try {
    // Check if meta_pixel_id or meta_capi_token is set in site_settings
    let pixelId = process.env.VITE_META_PIXEL_ID || "";
    let capiToken = process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN || "";

    if (supabaseAdmin) {
      const { data: settings } = await supabaseAdmin
        .from("site_settings")
        .select("key, value")
        .in("key", ["meta_pixel_id", "meta_capi_token"]);

      if (settings) {
        for (const s of settings) {
          if (s.key === "meta_pixel_id" && typeof s.value === "string" && s.value.trim()) {
            pixelId = s.value.trim();
          }
          if (s.key === "meta_capi_token" && typeof s.value === "string" && s.value.trim()) {
            capiToken = s.value.trim();
          }
        }
      }
    }

    if (!capiToken) {
      // CAPI token not set, client-side Meta Pixel handles tracking
      return { success: true, mode: "client_only" };
    }

    const payload = {
      data: [
        {
          event_name: event.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: event.eventId || undefined,
          event_source_url: event.sourceUrl || "https://rapidkeyz.com",
          action_source: "website",
          user_data: {
            em: event.userEmail ? [hashSha256(event.userEmail.trim().toLowerCase())] : undefined,
            ph: event.userPhone ? [hashSha256(event.userPhone.replace(/[^\d]/g, ""))] : undefined,
          },
          custom_data: event.customData,
        },
      ],
    };

    const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${capiToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    return { success: res.ok, result, mode: "capi_sent" };
  } catch (err) {
    console.error("Meta CAPI Error:", err);
    return { success: false, error: String(err) };
  }
}

function hashSha256(val: string): string {
  try {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(val).digest("hex");
  } catch {
    return val;
  }
}

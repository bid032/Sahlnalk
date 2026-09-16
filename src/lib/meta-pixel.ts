/**
 * Meta (Facebook) Pixel & Conversions API Utility for Sahlnalk
 */

export const DEFAULT_META_PIXEL_ID = "";

export function getMetaPixelId(): string {
  if (typeof window !== "undefined" && (window as any)._rk_meta_pixel_id) {
    return (window as any)._rk_meta_pixel_id;
  }
  return (import.meta.env.VITE_META_PIXEL_ID as string) || "";
}

/**
 * Safely initialize or update Meta Pixel with a specific Pixel ID.
 */
export function initOrUpdateMetaPixel(pixelId: string) {
  if (typeof window === "undefined" || !pixelId || !pixelId.trim()) return;

  const cleanId = pixelId.trim();
  const previousId = (window as any)._rk_meta_pixel_id;
  (window as any)._rk_meta_pixel_id = cleanId;

  // Initialize fbq stub if not existing
  if (!(window as any).fbq) {
    (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  }

  const fbq = (window as any).fbq;
  if (typeof fbq === "function" && previousId !== cleanId) {
    fbq("init", cleanId);
    if (!previousId) {
      fbq("track", "PageView");
    }
  }
}


/**
 * Safely call window.fbq with fallback checks
 */
export function trackMetaEvent(
  eventName: string,
  params: Record<string, any> = {},
  eventId?: string
) {
  if (typeof window === "undefined") return;

  try {
    const fbq = (window as any).fbq;
    if (typeof fbq === "function") {
      if (eventId) {
        fbq("track", eventName, params, { eventID: eventId });
      } else {
        fbq("track", eventName, params);
      }
    }
  } catch (err) {
    console.warn("Meta Pixel track error:", err);
  }
}

/**
 * Track PageView
 */
export function trackPageView(path?: string) {
  trackMetaEvent("PageView", {
    page_path: path || (typeof window !== "undefined" ? window.location.pathname : ""),
  });
}

/**
 * Track ViewContent (Product details view)
 */
export function trackViewContent(product: {
  id: string;
  name: string;
  price?: number | null;
  currency?: string;
  category?: string;
}) {
  trackMetaEvent("ViewContent", {
    content_name: product.name,
    content_ids: [product.id],
    content_type: "product",
    value: Number(product.price) || 0,
    currency: product.currency || "EGP",
    content_category: product.category || "Digital Services",
  });
}

/**
 * Track AddToCart
 */
export function trackAddToCart(item: {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  currency?: string;
}) {
  const qty = item.quantity || 1;
  const val = (Number(item.price) || 0) * qty;
  trackMetaEvent("AddToCart", {
    content_name: item.name,
    content_ids: [item.id],
    content_type: "product",
    value: val,
    currency: item.currency || "EGP",
    contents: [{ id: item.id, quantity: qty, item_price: item.price }],
  });
}

/**
 * Track InitiateCheckout
 */
export function trackInitiateCheckout(
  items: { id?: string; name: string; price: number; quantity: number }[],
  totalValue: number,
  currency = "EGP"
) {
  const contents = items.map((it) => ({
    id: it.id || it.name,
    quantity: it.quantity || 1,
    item_price: it.price || 0,
  }));
  const contentIds = items.map((it) => it.id || it.name);

  trackMetaEvent("InitiateCheckout", {
    content_type: "product",
    content_ids: contentIds,
    contents,
    num_items: items.reduce((sum, it) => sum + (it.quantity || 1), 0),
    value: Number(totalValue) || 0,
    currency,
  });
}

/**
 * Track Purchase (Deduplicated with eventId = orderId)
 */
export function trackPurchase(order: {
  orderId: string;
  total: number;
  currency?: string;
  items: { id?: string; name: string; price?: number; quantity?: number }[];
}) {
  const contents = order.items.map((it) => ({
    id: it.id || it.name,
    quantity: it.quantity || 1,
    item_price: it.price || 0,
  }));

  trackMetaEvent(
    "Purchase",
    {
      content_type: "product",
      content_ids: order.items.map((it) => it.id || it.name),
      contents,
      num_items: order.items.length,
      value: Number(order.total) || 0,
      currency: order.currency || "EGP",
    },
    order.orderId
  );
}

/**
 * Track Search
 */
export function trackSearch(searchQuery: string) {
  if (!searchQuery || !searchQuery.trim()) return;
  trackMetaEvent("Search", {
    search_string: searchQuery.trim(),
  });
}

/**
 * Track Contact (e.g. WhatsApp, Email, Support)
 */
export function trackContact(method = "WhatsApp") {
  trackMetaEvent("Contact", {
    contact_method: method,
  });
}

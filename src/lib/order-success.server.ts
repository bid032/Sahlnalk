import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PublicOrderItem = {
  name: string;
  mode: "instant_delivered" | "instant_pending" | "manual";
};

export type PublicOrderSummary = {
  number: string;
  orderId: string;
  email: string;
  total: number;
  currency: string;
  paymentGateway?: string;
  items: PublicOrderItem[];
};

/**
 * Guest-safe order lookup for /order-success.
 *
 * Guests have NO SELECT grant on `orders` (RLS: owners/admins only), and the
 * checkout's sessionStorage snapshot is deleted after first read — so a guest
 * who refreshes (or lands on the URL directly) otherwise sees an empty page
 * despite a perfectly valid URL.
 *
 * Proof of ownership here is the (order_id + order_number) PAIR from the URL:
 * the id is an unguessable UUID, so matching both is enough to safely return
 * the display-only summary below (no payment secrets, no other orders).
 */
export async function loadPublicOrderSummary(
  orderId: string,
  orderNumber: string,
): Promise<PublicOrderSummary | null> {
  try {
    const id = String(orderId ?? "").trim();
    const num = String(orderNumber ?? "").trim();
    if (!id || !num) return null;

    const { data: o, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, total, payment_gateway, customer_email, order_items(product_name, delivery_type, status)",
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !o) return null;

    // The number must match too — id alone is never enough.
    const stored = String((o as any).order_number ?? "").trim();
    if (!stored || stored.toLowerCase() !== num.toLowerCase()) return null;

    const rawItems = ((o as any).order_items ?? []) as Array<{
      product_name?: string | null;
      delivery_type?: string | null;
      status?: string | null;
    }>;

    return {
      number: stored || num || (o as any).id.slice(0, 8).toUpperCase(),
      orderId: (o as any).id,
      email: (o as any).customer_email || "",
      total: Number((o as any).total) || 0,
      currency: "EGP",
      paymentGateway: (o as any).payment_gateway || undefined,
      items: rawItems.map((it) => ({
        name: it.product_name || "خدمة رقمية",
        mode:
          it.status === "delivered"
            ? ("instant_delivered" as const)
            : it.delivery_type === "instant"
              ? ("instant_pending" as const)
              : ("manual" as const),
      })),
    };
  } catch (e) {
    console.error("[loadPublicOrderSummary] failed:", e);
    return null;
  }
}

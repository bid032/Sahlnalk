// Server-only: builds and sends the "order-delivered" email for a single order item.
// Extracted so both the admin delivery flow and the resend action share one path.

export async function resolveCustomerLang(supabaseAdmin: any, email: string): Promise<"ar" | "en"> {
  try {
    const { data: authUser } = await supabaseAdmin.auth.admin.listUsers();
    const match = authUser?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (!match) return "ar";
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("preferred_language")
      .eq("id", match.id)
      .maybeSingle();
    const raw = profile?.preferred_language;
    if (typeof raw === "string" && raw.toLowerCase().startsWith("en")) return "en";
    return "ar";
  } catch {
    return "ar";
  }
}

export type SendItemDeliveredResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function sendItemDeliveredEmail(orderItemId: string): Promise<SendItemDeliveredResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendTemplateEmail } = await import("./email-templates/send-email");

  const { data: item, error } = await supabaseAdmin
    .from("order_items")
    .select(
      "id, product_name, plan_label, delivered_accounts(account_email, account_username, account_password, extra_notes), orders(id, order_number, total, subtotal, discount_amount, currency, customer_email, coupons(code))",
    )
    .eq("id", orderItemId)
    .single();
  if (error || !item) throw new Error(error?.message || "Order item not found");

  const order: any = (item as any).orders;
  if (!order?.customer_email) return { ok: false, reason: "no_email" };
  const { deliveredList } = await import("./delivered");
  const accs = deliveredList((item as any).delivered_accounts);
  if (accs.length === 0) return { ok: false, reason: "no_delivered_accounts" };

  const accounts = accs.map((acc: any) => ({
    product_name: (item as any).product_name,
    plan_label: (item as any).plan_label,
    account_email: acc.account_email,
    account_username: acc.account_username,
    account_password: acc.account_password,
    extra_notes: acc.extra_notes,
    image_url: acc.image_url,
  }));

  const lang = await resolveCustomerLang(supabaseAdmin, order.customer_email);

  await sendTemplateEmail("order-delivered", order.customer_email, {
    idempotencyKey: `item-delivered-${orderItemId}`,
    templateData: {
      orderNumber: order.order_number,
      total: order.total,
      subtotal: order.subtotal,
      discountAmount: Number(order.discount_amount ?? 0),
      couponCode: order.coupons?.code ?? null,
      currency: order.currency || "EGP",
      accounts,
      lang,
    },
  });

  return { ok: true };
}

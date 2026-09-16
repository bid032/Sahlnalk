import { supabaseAdmin } from '@/integrations/supabase/client.server';

export async function loadMyOrders(userId: string) {
  try {
    let email: string | null = null;
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      email = userData?.user?.email ?? null;
    } catch (e) {
      console.error('[loadMyOrders] failed to fetch user email:', e);
    }

    let query = supabaseAdmin
      .from('orders')
      .select(`
        *,
        coupons (code, discount_type, discount_value),
        order_items (
          *,
          delivered_accounts (*)
        )
      `);

    if (email) {
      query = query.or(`user_id.eq.${userId},customer_email.ilike.${email}`);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data: orders, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[loadMyOrders] Supabase error:', error);
      return [];
    }

    // Deduplicate orders strictly by ID
    const uniqueOrdersMap = new Map<string, any>();
    for (const o of orders ?? []) {
      if (o?.id && !uniqueOrdersMap.has(o.id)) {
        uniqueOrdersMap.set(o.id, o);
      }
    }
    const deduplicatedOrders = Array.from(uniqueOrdersMap.values());
    // Filter out unpaid/cancelled PayPal orders - PayPal orders MUST be successfully paid to show in Dashboard
    const validOrders = deduplicatedOrders.filter((o: any) => {
      if (o?.payment_gateway === "paypal") {
        const isPaid =
          o.status === "paid" ||
          o.status === "delivered" ||
          o.status === "completed" ||
          o.payment_status === "PAID";
        return isPaid;
      }
      return true;
    });

    // Auto-link any guest orders matched by email to this userId
    if (validOrders.length > 0 && email) {
      const unlinked = validOrders.filter(
        (o) => !o.user_id && o.customer_email?.toLowerCase() === email!.toLowerCase(),
      );
      if (unlinked.length > 0) {
        const unlinkedIds = unlinked.map((o) => o.id);
        await supabaseAdmin.from('orders').update({ user_id: userId }).in('id', unlinkedIds);
      }
    }

    return validOrders;
  } catch (err) {
    console.error('[loadMyOrders] Unexpected error:', err);
    return [];
  }
}



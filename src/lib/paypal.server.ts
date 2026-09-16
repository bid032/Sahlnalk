import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface PayPalConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  mode: "sandbox" | "live";
  usdRate: number;
  baseUrl: string;
  webhookId?: string;
}

export async function getPayPalConfig(): Promise<PayPalConfig> {
  const { data: settings } = await supabaseAdmin
    .from("site_settings")
    .select("key, value");

  let enabled = false;
  let clientId = process.env.PAYPAL_CLIENT_ID || "";
  let clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  let mode: "sandbox" | "live" = (process.env.PAYPAL_MODE as "sandbox" | "live") || "sandbox";
  let usdRate = 50;
  let webhookId = process.env.PAYPAL_WEBHOOK_ID || "";

  if (settings) {
    for (const s of settings) {
      if (s.key === "paypal_enabled") enabled = Boolean(s.value);
      if (s.key === "paypal_client_id" && s.value) clientId = String(s.value).trim();
      if (s.key === "paypal_client_secret" && s.value) clientSecret = String(s.value).trim();
      if (s.key === "paypal_mode" && s.value) mode = String(s.value).trim() === "live" ? "live" : "sandbox";
      if (s.key === "usd_exchange_rate" && Number(s.value)) usdRate = Number(s.value);
      if (s.key === "paypal_webhook_id" && s.value) webhookId = String(s.value).trim();
    }
  }

  const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  return {
    enabled,
    clientId,
    clientSecret,
    mode,
    usdRate,
    baseUrl,
    webhookId,
  };
}

export async function getPayPalAccessToken(config: PayPalConfig): Promise<string> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("PAYPAL_CREDENTIALS_MISSING: PayPal Client ID and Client Secret must be configured on the server.");
  }

  const authString = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authString}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("[PayPal Server] OAuth Token Error:", errorText);
    throw new Error(`PAYPAL_AUTH_FAILED: Failed to authenticate with PayPal (${res.status})`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Server-side order creation.
 * Retrieves local order from DB, calculates USD total based on DB prices (source of truth),
 * calls PayPal REST API v2 orders endpoint, and saves paypal_order_id to DB.
 */
export async function createPayPalOrderOnServer(localOrderId: string) {
  const config = await getPayPalConfig();

  // 1. Fetch local order from DB
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", localOrderId)
    .single();

  if (orderErr || !order) {
    throw new Error(`ORDER_NOT_FOUND: Order ${localOrderId} not found.`);
  }

  if (order.status === "paid" || order.payment_status === "PAID") {
    throw new Error("ORDER_ALREADY_PAID: Order has already been paid.");
  }

  // Source of truth calculation:
  const totalEGP = Number(order.total);
  const usdAmountNum = Math.max(0.01, Math.round((totalEGP / config.usdRate) * 100) / 100);
  const amountUSD = usdAmountNum.toFixed(2);

  // 2. Get Access Token
  const token = await getPayPalAccessToken(config);

  // 3. Create PayPal Order v2
  const paypalRes = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: localOrderId,
          custom_id: localOrderId,
          description: `Order #${order.order_number}`,
          amount: {
            currency_code: "USD",
            value: amountUSD,
          },
        },
      ],
    }),
  });

  const paypalData = (await paypalRes.json()) as any;

  if (!paypalRes.ok || !paypalData.id) {
    console.error("[PayPal Server] Create Order Error:", paypalData);
    throw new Error(`PAYPAL_CREATE_ORDER_FAILED: ${paypalData?.message || "Failed to create PayPal order."}`);
  }

  const paypalOrderId = paypalData.id as string;

  // 4. Record paypal_order_id & PENDING status in DB
  try {
    await supabaseAdmin
      .from("orders")
      .update({
        paypal_order_id: paypalOrderId,
        payment_status: "PENDING",
        fulfillment_status: "PENDING",
        payment_gateway: "paypal" as any,
      })
      .eq("id", localOrderId);
  } catch (dbErr) {
    console.warn("[PayPal Server] DB update non-fatal warning:", dbErr);
    try {
      await supabaseAdmin
        .from("orders")
        .update({ payment_reference: paypalOrderId })
        .eq("id", localOrderId);
    } catch {}
  }

  return {
    paypalOrderId,
    amountUSD,
    currency: "USD",
  };
}

/**
 * Server-side order capture.
 * Authenticates with PayPal, captures the order via POST /v2/checkout/orders/{id}/capture,
 * confirms status === "COMPLETED", and idempotently updates DB order to PAID and triggers fulfillment.
 */
export async function capturePayPalOrderOnServer(localOrderId: string, paypalOrderId: string) {
  const config = await getPayPalConfig();

  // 1. Fetch order from DB for idempotency check
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", localOrderId)
    .single();

  if (orderErr || !order) {
    throw new Error(`ORDER_NOT_FOUND: Order ${localOrderId} not found.`);
  }

  // Idempotency check: If order is ALREADY marked paid, return success immediately
  if (order.status === "paid" || order.payment_status === "PAID") {
    return {
      ok: true,
      alreadyPaid: true,
      orderId: localOrderId,
      orderNumber: order.order_number,
      paymentStatus: "PAID",
      fulfillmentStatus: order.fulfillment_status || "COMPLETED",
    };
  }

  // 2. Get Access Token
  const token = await getPayPalAccessToken(config);

  // 3. Call PayPal Capture API v2
  const captureRes = await fetch(`${config.baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
  });

  const captureData = (await captureRes.json()) as any;

  // Check if capture was already done previously (ORDER_ALREADY_CAPTURED)
  if (!captureRes.ok && captureData.name === "UNPROCESSABLE_ENTITY" && captureData.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED") {
    return await fulfillLocalOrder(order, paypalOrderId, "ALREADY_CAPTURED");
  }

  const status = captureData.status;
  const isCompleted = status === "COMPLETED";

  if (!captureRes.ok || !isCompleted) {
    console.error("[PayPal Server] Capture Error:", captureData);
    await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "FAILED",
        status: "pending",
      })
      .eq("id", localOrderId);

    const issue = captureData?.details?.[0]?.issue || captureData?.message || "Payment capture failed";
    throw new Error(`PAYPAL_CAPTURE_FAILED: ${issue}`);
  }

  const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id || paypalOrderId;

  // 4. Mark order as PAID & trigger fulfillment
  return await fulfillLocalOrder(order, paypalOrderId, captureId);
}

/**
 * Idempotent fulfillment helper.
 * Marks the order PAID, assigns stock if available, sends notifications, and updates fulfillment status.
 */
export async function fulfillLocalOrder(order: any, paypalOrderId: string, captureId: string) {
  // Idempotency check: Verify order status first
  const { data: freshOrder } = await supabaseAdmin
    .from("orders")
    .select("status, payment_status, fulfillment_status")
    .eq("id", order.id)
    .single();

  if (freshOrder?.status === "paid" || freshOrder?.payment_status === "PAID") {
    return {
      ok: true,
      alreadyPaid: true,
      orderId: order.id,
      orderNumber: order.order_number,
      paymentStatus: "PAID",
      fulfillmentStatus: freshOrder.fulfillment_status || "COMPLETED",
    };
  }

  const now = new Date().toISOString();

  // 1. Update Order status to PAID
  await supabaseAdmin
    .from("orders")
    .update({
      status: "paid",
      payment_status: "PAID",
      fulfillment_status: "COMPLETED",
      paypal_order_id: paypalOrderId,
      paypal_capture_id: captureId,
      paid_at: now,
      payment_reference: paypalOrderId,
    })
    .eq("id", order.id);

  // 2. Process Instant Digital Keys Fulfillment
  const { data: orderItems } = await supabaseAdmin
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  if (orderItems && orderItems.length > 0) {
    for (const item of orderItems) {
      if (item.delivery_type === "instant" && item.plan_id) {
        try {
          // Check if item already has a delivered account (idempotency check)
          const { data: existingDelivered } = await supabaseAdmin
            .from("delivered_accounts")
            .select("id")
            .eq("order_item_id", item.id)
            .maybeSingle();

          if (!existingDelivered) {
            // Find available stock item
            const { data: inventoryItem } = await supabaseAdmin
              .from("account_inventory")
              .select("*")
              .eq("plan_id", item.plan_id)
              .eq("status", "available")
              .limit(1)
              .maybeSingle();

            if (inventoryItem) {
              // Atomically claim inventory item
              await supabaseAdmin
                .from("account_inventory")
                .update({
                  status: "delivered",
                  delivered_order_item_id: item.id,
                  delivered_at: now,
                })
                .eq("id", inventoryItem.id);

              // Create delivered_accounts record
              await supabaseAdmin
                .from("delivered_accounts")
                .insert({
                  order_item_id: item.id,
                  account_email: inventoryItem.account_email,
                  account_username: inventoryItem.account_username,
                  account_password: inventoryItem.account_password,
                  extra_notes: inventoryItem.extra_notes,
                  delivered_at: now,
                });

              // Mark item as delivered
              await supabaseAdmin
                .from("order_items")
                .update({ status: "delivered" })
                .eq("id", item.id);
            }
          }
        } catch (itemErr) {
          console.error(`[PayPal Server] Item ${item.id} instant fulfillment error:`, itemErr);
        }
      }
    }
  }

  // 3. Email notifications (non-blocking, best-effort)
  try {
    const { notifyNewOrderDirect, notifyCustomerDeliveryDirect } = await import("./notify-order.functions");
    await notifyNewOrderDirect({ data: { orderId: order.id } }).catch(() => {});
    await notifyCustomerDeliveryDirect({ data: { orderId: order.id } }).catch(() => {});
  } catch (emailErr) {
    console.error("[PayPal Server] Email notification error:", emailErr);
  }

  // 4. Meta CAPI Purchase event
  try {
    const { trackMetaCapiServerFn } = await import("./meta-pixel.functions");
    await trackMetaCapiServerFn({
      data: {
        eventName: "Purchase",
        eventId: order.id,
        userEmail: order.customer_email || "",
        userPhone: order.customer_phone || "",
        sourceUrl: "https://rapidkeyz.com/checkout",
        customData: {
          value: Number(order.total),
          currency: "EGP",
          content_ids: (orderItems || []).map((i: any) => i.product_id),
          num_items: (orderItems || []).length,
        },
      },
    }).catch(() => {});
  } catch {}

  return {
    ok: true,
    orderId: order.id,
    orderNumber: order.order_number,
    paymentStatus: "PAID",
    fulfillmentStatus: "COMPLETED",
  };
}

/**
 * PayPal Webhook verification and handler.
 */
export async function handlePayPalWebhook(headers: Headers, rawBody: string) {
  const config = await getPayPalConfig();

  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const certUrl = headers.get("paypal-cert-url");
  const authAlgo = headers.get("paypal-auth-algo");
  const transmissionSig = headers.get("paypal-transmission-sig");

  // Parse event JSON
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new Error("INVALID_WEBHOOK_JSON: Webhook body is not valid JSON.");
  }

  // Verify Webhook Signature if webhookId is configured
  if (config.webhookId && transmissionId && transmissionSig && certUrl && authAlgo) {
    try {
      const token = await getPayPalAccessToken(config);
      const verifyRes = await fetch(`${config.baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transmission_id: transmissionId,
          transmission_time: transmissionTime,
          cert_url: certUrl,
          auth_algo: authAlgo,
          transmission_sig: transmissionSig,
          webhook_id: config.webhookId,
          webhook_event: event,
        }),
      });

      const verifyData = (await verifyRes.json()) as any;
      if (verifyData.verification_status !== "SUCCESS") {
        console.warn("[PayPal Webhook] Signature verification failed:", verifyData);
        throw new Error("WEBHOOK_VERIFICATION_FAILED: Signature invalid.");
      }
    } catch (vErr: any) {
      console.warn("[PayPal Webhook] Verification request error:", vErr.message);
      // Proceed with caution or log warning
    }
  }

  const eventType = event.event_type;
  const resource = event.resource;

  console.log(`[PayPal Webhook] Event Received: ${eventType}`);

  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    const paypalOrderId = resource.supplementary_data?.related_ids?.order_id || resource.custom_id;
    const localOrderId = resource.custom_id || resource.reference_id;
    const captureId = resource.id;

    if (localOrderId || paypalOrderId) {
      let query = supabaseAdmin.from("orders").select("*, order_items(*)");
      if (localOrderId) query = query.eq("id", localOrderId);
      else if (paypalOrderId) query = query.eq("paypal_order_id", paypalOrderId);

      const { data: order } = await query.maybeSingle();

      if (order) {
        await fulfillLocalOrder(order, paypalOrderId || order.paypal_order_id, captureId);
      }
    }
  } else if (eventType === "PAYMENT.CAPTURE.PENDING") {
    const localOrderId = resource.custom_id || resource.reference_id;
    if (localOrderId) {
      await supabaseAdmin
        .from("orders")
        .update({ payment_status: "PENDING", fulfillment_status: "PENDING" })
        .eq("id", localOrderId);
    }
  } else if (eventType === "PAYMENT.CAPTURE.DENIED" || eventType === "CHECKOUT.PAYMENT-APPROVAL.REVERSED") {
    const localOrderId = resource.custom_id || resource.reference_id;
    if (localOrderId) {
      await supabaseAdmin
        .from("orders")
        .update({ payment_status: "FAILED", status: "cancelled", fulfillment_status: "FAILED" })
        .eq("id", localOrderId);
    }
  }

  return { received: true, eventType };
}

/**
 * Guest-safe cancellation of a still-pending order (PayPal onCancel, stale
 * pending cleanup). Guests have no UPDATE grant on `orders`, so the
 * client-side update silently fails for them and junk pending rows pile up.
 * Safety: only touches rows still in `pending` state — paid/delivered orders
 * are never modified. The id is an unguessable UUID known only to the buyer
 * (their own checkout session/URL).
 */
export async function cancelPendingOrderOnServer(orderId: string): Promise<{ ok: boolean }> {
  try {
    const id = String(orderId ?? "").trim();
    if (!id) return { ok: false };
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, payment_status")
      .eq("id", id)
      .maybeSingle();
    if (!order) return { ok: false };
    if ((order as any).status !== "pending") return { ok: false };
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled", payment_status: "CANCELLED" })
      .eq("id", id)
      .eq("status", "pending");
    return { ok: !error };
  } catch (e) {
    console.error("[cancelPendingOrder] failed:", e);
    return { ok: false };
  }
}

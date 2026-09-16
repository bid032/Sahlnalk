import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const createOrderInput = z.object({
  orderId: z.string(),
});

const captureOrderInput = z.object({
  orderId: z.string(),
  paypalOrderId: z.string(),
});

export const createPayPalOrderServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createOrderInput.parse(data))
  .handler(async ({ data }) => {
    const { createPayPalOrderOnServer } = await import("./paypal.server");
    return createPayPalOrderOnServer(data.orderId);
  });

export const capturePayPalOrderServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => captureOrderInput.parse(data))
  .handler(async ({ data }) => {
    const { capturePayPalOrderOnServer } = await import("./paypal.server");
    return capturePayPalOrderOnServer(data.orderId, data.paypalOrderId);
  });

const cancelPendingInput = z.object({
  orderId: z.string().trim().min(8).max(64),
});

export const cancelPendingOrderServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => cancelPendingInput.parse(data))
  .handler(async ({ data }) => {
    const { cancelPendingOrderOnServer } = await import("./paypal.server");
    return cancelPendingOrderOnServer(data.orderId);
  });

export const getPublicPayPalConfigServerFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getPayPalConfig } = await import("./paypal.server");
    const config = await getPayPalConfig();
    return {
      paypalClientId: config.clientId,
      paypalEnabled: config.enabled,
      usdRate: config.usdRate,
    };
  });


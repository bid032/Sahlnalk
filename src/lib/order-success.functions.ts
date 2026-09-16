import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const publicOrderInput = z.object({
  orderId: z.string().trim().min(8).max(64),
  orderNumber: z.string().trim().min(3).max(32),
});

export const getPublicOrderSummary = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => publicOrderInput.parse(data))
  .handler(async ({ data }) => {
    const { loadPublicOrderSummary } = await import("./order-success.server");
    return loadPublicOrderSummary(data.orderId, data.orderNumber);
  });

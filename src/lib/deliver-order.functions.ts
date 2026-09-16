import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const manualInput = z.object({
  orderItemId: z.string().uuid(),
  creds: z.object({
    account_email: z.string().optional().nullable(),
    account_username: z.string().optional().nullable(),
    account_password: z.string().optional().nullable(),
    extra_notes: z.string().optional().nullable(),
    image_url: z.string().optional().nullable(),
  }),
});

const stockInput = z.object({
  orderItemId: z.string().uuid(),
  planId: z.string().uuid(),
});

export const deliverItemManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => manualInput.parse(data))
  .handler(async ({ data, context }) => {
    const { deliverManual } = await import("./deliver-order.server");
    return deliverManual(context.userId, data.orderItemId, data.creds);
  });

export const deliverItemFromStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => stockInput.parse(data))
  .handler(async ({ data, context }) => {
    const { deliverFromStock } = await import("./deliver-order.server");
    return deliverFromStock(context.userId, data.orderItemId, data.planId);
  });


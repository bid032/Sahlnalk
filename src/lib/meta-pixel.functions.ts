import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const capiInput = z.object({
  eventName: z.string(),
  eventId: z.string().optional(),
  sourceUrl: z.string().optional(),
  userEmail: z.string().optional(),
  userPhone: z.string().optional(),
  customData: z.record(z.string(), z.any()).optional(),
});

export const trackMetaCapiServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => capiInput.parse(data))
  .handler(async ({ data }) => {
    const { sendCapiEvent } = await import("./meta-pixel.server");
    return sendCapiEvent(data);
  });

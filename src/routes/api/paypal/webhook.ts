import { createFileRoute } from "@tanstack/react-router";
import { handlePayPalWebhook } from "@/lib/paypal.server";

export const Route = createFileRoute("/api/paypal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const rawBody = await request.text();
          const result = await handlePayPalWebhook(request.headers, rawBody);
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (err: any) {
          console.error("[API /api/paypal/webhook] Error:", err);
          return new Response(
            JSON.stringify({ error: err.message || "Webhook processing error" }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            }
          );
        }
      },
    },
  },
});

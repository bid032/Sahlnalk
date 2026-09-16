import { createFileRoute } from "@tanstack/react-router";
import { capturePayPalOrderOnServer } from "@/lib/paypal.server";

export const Route = createFileRoute("/api/paypal/capture-order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { orderId: string; paypalOrderId: string };
          if (!body.orderId || !body.paypalOrderId) {
            return new Response(JSON.stringify({ error: "Missing orderId or paypalOrderId" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
          const result = await capturePayPalOrderOnServer(body.orderId, body.paypalOrderId);
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (err: any) {
          console.error("[API /api/paypal/capture-order] Error:", err);
          return new Response(
            JSON.stringify({ error: err.message || "Failed to capture PayPal order" }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            }
          );
        }
      },
    },
  },
});

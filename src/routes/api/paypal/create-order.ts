import { createFileRoute } from "@tanstack/react-router";
import { createPayPalOrderOnServer } from "@/lib/paypal.server";

export const Route = createFileRoute("/api/paypal/create-order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { orderId: string };
          if (!body.orderId) {
            return new Response(JSON.stringify({ error: "Missing orderId" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          }
          const result = await createPayPalOrderOnServer(body.orderId);
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (err: any) {
          console.error("[API /api/paypal/create-order] Error:", err);
          return new Response(
            JSON.stringify({ error: err.message || "Failed to create PayPal order" }),
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

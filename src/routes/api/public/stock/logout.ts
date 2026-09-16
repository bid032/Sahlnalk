import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stock/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { stockSessionClearCookie } = await import("@/lib/stock-auth.server");
        return Response.json({ ok: true }, { headers: { "Set-Cookie": stockSessionClearCookie(request.url) } });
      },
    },
  },
});
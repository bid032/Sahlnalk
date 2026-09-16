import { createFileRoute } from "@tanstack/react-router";

/**
 * Keep-alive / health endpoint.
 *
 * cPanel (Passenger) puts an idle Node app to sleep and boots it again on the
 * next visit , that cold boot is a large part of the "blank page for 10,20s"
 * the first visitor sees. Ping this URL every 5 minutes (cPanel Cron job:
 * `curl -s https://yourdomain.com/api/public/health > /dev/null`) so the
 * process stays warm and real visitors never pay the boot cost.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
    },
  },
});

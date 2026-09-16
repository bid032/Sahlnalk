import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase keep-alive (anti cold-start).
 *
 * On the Supabase free plan the database and the Data API go idle when no
 * traffic hits them, so the *first* visitor pays several seconds of wake-up
 * time. This endpoint runs one tiny indexed read to keep the project warm.
 *
 * Ping it every 5 minutes from any free scheduler, e.g. cron-job.org:
 *   https://<your-domain>/api/public/keep-alive
 *
 * It is intentionally read-only, returns no data, and is safe to expose.
 */
export const Route = createFileRoute("/api/public/keep-alive")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let ok = false;
        let message: string | null = null;

        try {
          const url = process.env["SUPABASE_URL"];
          const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
          if (!url || !key) throw new Error("Supabase env vars are missing");

          const supabase = createClient(url, key, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });

          const { error } = await supabase
            .from("site_settings")
            .select("key")
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          ok = true;
        } catch (err) {
          message = err instanceof Error ? err.message : "unknown error";
        }

        return new Response(
          JSON.stringify({ ok, ms: Date.now() - started, error: message, ts: Date.now() }),
          {
            status: ok ? 200 : 503,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          },
        );
      },
    },
  },
});

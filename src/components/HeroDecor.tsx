import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withQueryFallback } from "@/lib/loader-timeout";

/**
 * Static hero decoration: CSS gradient layers + a grid pattern + product logos.
 * No canvas, no WebGL, no animation -renders instantly with the first paint.
 */

/** Faint grid of squares/lines behind the hero. */
export function HeroGrid() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--border) / 0.55) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.55) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at center, black 45%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 45%, transparent 85%)",
        }}
      />
      {/* A few accent squares sitting on the grid */}
      <div className="absolute top-[18%] start-[12%] size-[56px] rounded-[6px] border border-brand/25 bg-brand/[0.06]" />
      <div className="absolute top-[62%] start-[24%] size-[112px] rounded-[10px] border border-border/60" />
      <div className="absolute top-[30%] end-[16%] size-[56px] rounded-[6px] border border-brand/20 bg-brand/[0.05]" />
      <div className="absolute bottom-[14%] end-[28%] size-[56px] rounded-[6px] border border-border/60" />
    </div>
  );
}

/**
 * Static colour layers that sit under the grid: a brand-tinted top wash, two
 * soft corner gradients, a fine top hairline and a bottom fade into the page.
 * Pure CSS, zero animation, no extra network requests.
 */
export function HeroGradients() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
      {/* Base vertical wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, hsl(var(--brand) / 0.07) 0%, transparent 45%, hsl(var(--accent) / 0.05) 100%)",
        }}
      />
      {/* Corner tints */}
      <div
        className="absolute -top-1/3 -end-1/4 w-[70%] h-[140%] rounded-full opacity-70"
        style={{ background: "radial-gradient(closest-side, hsl(var(--brand) / 0.16), transparent 70%)" }}
      />
      <div
        className="absolute -bottom-1/2 -start-1/4 w-[65%] h-[140%] rounded-full opacity-60"
        style={{ background: "radial-gradient(closest-side, hsl(var(--accent) / 0.14), transparent 70%)" }}
      />
      {/* Centre spotlight to lift the headline area */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 20%, hsl(var(--foreground) / 0.05), transparent 70%)",
        }}
      />
      {/* Top hairline */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, hsl(var(--brand) / 0.45), transparent)",
        }}
      />
      {/* Fade into the next section */}
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{ background: "linear-gradient(180deg, transparent, hsl(var(--background)))" }}
      />
    </div>
  );
}

async function fetchLogos(): Promise<string[]> {
  const { data } = await supabase
    .from("products")
    .select("loading_icon_url")
    .eq("status", "active")
    .not("loading_icon_url", "is", null)
    .limit(12);
  return (data ?? []).map((d: any) => d.loading_icon_url).filter(Boolean);
}

/** Shared key so the route loader primes exactly what the component reads. */
export const heroLogosQuery = () =>
  queryOptions({
    queryKey: ["floating-logos"] as const,
    queryFn: withQueryFallback(fetchLogos, [] as string[], 2500),
    staleTime: 5 * 60_000,
  });

const POSITIONS = [
  { top: "8%", left: "6%", size: 52 },
  { top: "10%", left: "90%", size: 56 },
  { top: "62%", left: "4%", size: 48 },
  { top: "72%", left: "82%", size: 56 },
  { top: "40%", left: "95%", size: 42 },
  { top: "48%", left: "2%", size: 50 },
  { top: "88%", left: "38%", size: 40 },
] as const;

/**
 * Same data source as before, rendered static (no float, no parallax).
 *
 * The icons are decoded before they are shown, so they all appear together and
 * complete the moment the splash loader disappears -never one by one.
 */
export function HeroStaticLogos({ initialLogos }: { initialLogos?: string[] }) {
  const { data } = useQuery({
    ...heroLogosQuery(),
    initialData: initialLogos?.length ? initialLogos : undefined,
  });

  const urls = (data ?? []).slice(0, POSITIONS.length);

  if (!urls.length) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-[5] hidden md:block overflow-hidden"
    >
      {POSITIONS.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full overflow-hidden bg-card/40 border border-border/40 grid place-items-center shadow-lg"
          style={{ top: p.top, left: p.left, width: p.size, height: p.size }}
        >
          <img
            src={urls[i % urls.length]}
            alt=""
            width={p.size}
            height={p.size}
            loading="eager"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      ))}
    </div>
  );
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import appCss from "../styles.css?url";

// Origin of the Supabase project -used for an early preconnect so the first
// data request doesn't pay for DNS + TLS (a big part of the "cold" feel).
const SUPABASE_ORIGIN: string = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
})();
import { trackPageView } from "@/lib/meta-pixel";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppProvider } from "@/contexts/AppContext";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { Toaster } from "@/components/ui/sonner";
import { usePublicRealtime } from "@/hooks/usePublicRealtime";
import { MetaPixelManager } from "@/components/MetaPixelManager";


function PublicRealtime() {
  usePublicRealtime();
  return null;
}

import { lazyClient } from "@/components/ClientOnly";
const GsapEffects = lazyClient(() => import("@/components/GsapEffects").then((m) => ({ default: m.GsapEffects })));
import { supabase } from "@/integrations/supabase/client";
// تم تعديل استخدام اللوجو من فولدر public بدلاً من assets

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/4 start-1/2 -translate-x-1/2 w-[620px] h-[420px] rounded-full bg-brand/20 blur-[140px]" />
        <div className="absolute bottom-0 end-0 w-[400px] h-[400px] rounded-full bg-brand/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,hsl(var(--background))_70%)]" />
      </div>
      <div className="relative max-w-lg text-center">
        <div className="relative mx-auto mb-6 grid h-32 w-32 place-items-center">
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand border-e-brand/40 animate-spin" style={{ animationDuration: "3s" }} />
          <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-brand/60 animate-spin" style={{ animationDuration: "4s", animationDirection: "reverse" }} />
          <span className="relative text-5xl font-black text-brand drop-shadow-[0_0_20px_hsl(var(--brand)/0.5)]">4·4</span>
        </div>
        <h1 className="bg-gradient-to-r from-brand via-foreground to-brand bg-clip-text text-6xl font-black tracking-tight text-transparent">
          404
        </h1>
        <h2 className="mt-3 text-2xl font-bold text-foreground">
          الصفحة غير موجودة
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          الرابط اللي بتحاول تفتحه مش موجود أو اتنقل. ارجع للرئيسية وابدأ من هناك.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-bold text-brand-foreground shadow-lg hover:brand-glow transition-all active:scale-95"
          >
            الرئيسية
          </Link>
          <Link
            to="/shop"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold text-foreground hover:border-brand/60 hover:text-brand transition-all active:scale-95"
          >
            تصفح المتجر
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  // Soft retry: reset the boundary only. No cache wipe, no router-wide
  // invalidation, and never a hard reload — the mounted tree stays alive so
  // the user never sees a full repaint.
  const handleRetry = () => {
    reset();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try again.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={handleRetry}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
          >
            Try again
          </button>
          <Link to="/" className="rounded-md border border-border bg-background px-4 py-2 text-sm">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "سهلنالك | اشتراكات أصلية بالجنيه وتسليم فوري" },
      {
        name: "description",
        content:
          "اشترِ ChatGPT Plus وMidjourney وCanva وأكتر من 100 اشتراك أصلي بالجنيه المصري. تسليم في دقائق، ضمان حقيقي، ودعم واتساب.",
      },
      { property: "og:site_name", content: "Sahlnalk" },
      { property: "og:title", content: "سهلنالك | اشتراكات أصلية بالجنيه وتسليم فوري" },
      {
        property: "og:description",
        content:
          "اشتراكات أصلية بالجنيه المصري - تسليم في دقائق، ضمان حقيقي، ودعم واتساب بيرد بسرعة.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rapidkeyz.com/" },
      { property: "og:locale", content: "ar_EG" },
      { property: "og:image", content: "https://rapidkeyz.com/cover.webp" },
      { property: "og:image:secure_url", content: "https://rapidkeyz.com/cover.webp" },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "سهلنالك - اشتراكات أصلية بالجنيه وتسليم فوري" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "سهلنالك | اشتراكات أصلية بالجنيه وتسليم فوري" },
      {
        name: "twitter:description",
        content:
          "اشتراكات أصلية بالجنيه المصري - تسليم في دقائق، ضمان حقيقي، ودعم واتساب بيرد بسرعة.",
      },
      { name: "twitter:image", content: "https://rapidkeyz.com/cover.webp" },
      { name: "theme-color", content: "#00a9e0" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Open the DNS/TLS connection to Supabase while the HTML is still
      // parsing -the first data request then skips the handshake entirely.
      ...(SUPABASE_ORIGIN
        ? [
          { rel: "preconnect", href: SUPABASE_ORIGIN, crossOrigin: "anonymous" as const },
          { rel: "dns-prefetch", href: SUPABASE_ORIGIN },
        ]
        : []),
      { rel: "preconnect", href: "https://connect.facebook.net" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      // Self-hosted Rubik: preload the two subsets every visitor needs.
      { rel: "preload", href: "/fonts/rubik-arabic-normal.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "preload", href: "/fonts/rubik-latin-normal.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "Sahlnalk",
              url: "https://rapidkeyz.com/",
              logo: "https://rapidkeyz.com/logo.png",
              sameAs: ["https://wa.me/201284234815"],
            },
            {
              "@type": "WebSite",
              name: "Sahlnalk",
              url: "https://rapidkeyz.com/",
              inLanguage: "ar",
              potentialAction: {
                "@type": "SearchAction",
                target: "https://rapidkeyz.com/shop?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if('scrollRestoration' in history){history.scrollRestoration='manual';}window.addEventListener('beforeunload',function(){try{window.scrollTo(0,0);}catch(e){}});window.addEventListener('load',function(){try{window.scrollTo(0,0);}catch(e){}});var m=localStorage.getItem('rk-theme-mode');var t=(m==='light'||m==='dark')?m:localStorage.getItem('rk-theme');var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(t==='light'?'light':'dark');}catch(e){}})();`,
          }}
        />

        <HeadContent />
      </head>
      <body>

        {children}
        <Scripts />
      </body>

    </html>
  );
}

function MetaPixelPageView() {
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const search = router.state.location.searchStr;
  const first = useRef(true);

  useEffect(() => {
    // Standard base snippet tracks the initial PageView, so skip first trigger
    if (first.current) {
      first.current = false;
      return;
    }
    trackPageView(pathname);
  }, [pathname, search]);

  return null;
}

/**
 * Thin top progress bar for client-side navigations. It only reflects the
 * router's pending state — the page underneath stays mounted and interactive,
 * so the user never sees a repaint or a tab-level spinner.
 */
function RoutePendingBar() {
  const isLoading = useRouterState({ select: (s) => s.status === "pending" });
  if (!isLoading) return null;
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[10020] h-0.5 overflow-hidden bg-transparent"
    >
      <div className="h-full w-1/3 animate-[route-pending-slide_1s_ease-in-out_infinite] rounded-full bg-brand" />
      <style>{`@keyframes route-pending-slide{0%{transform:translateX(100%)}100%{transform:translateX(-300%)}}`}</style>
    </div>
  );
}

/** Query keys that are user/account-scoped (safe to refresh on auth change). */
const AUTH_SCOPED_KEY_PREFIXES = [
  "admin",
  "my-orders",
  "my-",
  "user-",
  "profile",
  "profiles",
  "orders",
  "order-items",
  "refunds",
  "coupons-mine",
];

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Domain redirect from rapidkeyz.shop to rapidkeyz.com
    if (typeof window !== "undefined" && window.location.hostname.toLowerCase().includes("rapidkeyz.shop")) {
      const targetUrl = "https://rapidkeyz.com" + window.location.pathname + window.location.search + window.location.hash;
      window.location.replace(targetUrl);
      return;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      // Smart auth refresh: only user-scoped queries refetch in the background.
      // Never router.invalidate() here — that re-runs every route loader,
      // flips the router to pending (tab spinner) and repaints the page.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({
          predicate: (q) => {
            const key = q.queryKey as unknown[];
            const head = typeof key?.[0] === "string" ? (key[0] as string) : "";
            return AUTH_SCOPED_KEY_PREFIXES.some(
              (p) => head === p || head.startsWith(p),
            );
          },
        });
      }, 150);
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <PublicRealtime />
        <MetaPixelManager />
        <MetaPixelPageView />
        <RoutePendingBar />
        {/* NOTE: no key={pathname} here on purpose. Keying the Outlet by path
            unmounts the whole tree (Header/Footer/state) on every navigation
            and repaints everything from scratch. The Outlet stays mounted and
            each route animates its own content instead. */}
        <Outlet />
        <GsapEffects />
        <WhatsAppFloat />
        <Toaster />
      </AppProvider>
    </QueryClientProvider>
  );
}
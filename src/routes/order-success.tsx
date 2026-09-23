import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, Mail, PartyPopper, Truck } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteButton } from "@/components/ui/site-button";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { trackPurchase } from "@/lib/meta-pixel";
import { trackMetaCapiServerFn } from "@/lib/meta-pixel.functions";
import { getPublicOrderSummary } from "@/lib/order-success.functions";

export const Route = createFileRoute("/order-success")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      order_id: (search.order_id as string) || (search.orderId as string) || "",
      order_number: (search.order_number as string) || (search.orderNumber as string) || "",
    };
  },
  head: () => ({
    meta: [
      { title: "سهلنالك | طلبك اتأكد" },
      { name: "description", content: "استلمنا طلبك وبدأنا التنفيذ - بيانات اشتراكك في الطريق لإيميلك." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "سهلنالك | طلبك اتأكد" },
      { property: "og:description", content: "استلمنا طلبك وبدأنا التنفيذ - بيانات اشتراكك في الطريق لإيميلك." },
    ],
  }),
  component: OrderSuccessPage,
});

// The checkout page stores the last order here right before redirecting.
export const LAST_ORDER_KEY = "rk-last-order";

type LastOrder = {
  number: string;
  orderId: string;
  email: string;
  total: number;
  currency: string;
  paymentGateway?: string;
  items: { name: string; mode: "instant_delivered" | "instant_pending" | "manual" }[];
};

function formatGatewayLabel(gw?: string, lang: "ar" | "en" = "ar"): string {
  if (!gw) return lang === "ar" ? "دفع إلكتروني مؤكد" : "Confirmed Payment";
  const lower = gw.toLowerCase();
  if (lower.includes("paypal")) return "PayPal";
  if (
    lower.includes("instapay") ||
    lower.includes("vodafone") ||
    lower.includes("wallet") ||
    lower.includes("manual")
  ) {
    return lang === "ar" ? "إنستاباي / محفظة إلكترونية" : "InstaPay / E-Wallet";
  }
  return gw;
}

function OrderSuccessPage() {
  const { lang, t } = useApp();
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  const searchOrderId = searchParams.order_id;
  const searchOrderNumber = searchParams.order_number;

  const [order, setOrder] = useState<LastOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const tracked = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));

    async function loadOrderData() {
      let parsed: LastOrder | null = null;
      try {
        const raw = sessionStorage.getItem(LAST_ORDER_KEY);
        if (raw) parsed = JSON.parse(raw) as LastOrder;
      } catch { }

      // Fallback 1 (guest-safe): the URL's (order_id + order_number) pair is
      // verified server-side and returns the display summary. This is what
      // rescues guests: they have no SELECT grant on `orders`, and the
      // sessionStorage snapshot is deleted after its first read, so without
      // this a refresh/direct visit shows an empty page on a valid URL.
      if (!parsed && searchOrderId && searchOrderNumber) {
        try {
          const summary = await getPublicOrderSummary({
            data: { orderId: searchOrderId, orderNumber: searchOrderNumber },
          });
          if (summary) {
            parsed = {
              number: summary.number,
              orderId: summary.orderId,
              email: summary.email,
              total: summary.total,
              currency: summary.currency,
              paymentGateway: summary.paymentGateway ?? "paypal",
              items: summary.items,
            };
          }
        } catch (e) {
          console.error("Failed fetching public order summary", e);
        }
      }

      // Fallback 2 (legacy): direct row read — only works for signed-in owners
      // (RLS). Kept as a last resort; guests are covered by fallback 1.
      if (!parsed && searchOrderId) {
        try {
          const { data: o } = await supabase
            .from("orders")
            .select(
              "id, order_number, total, payment_gateway, customer_email, order_items(product_name, delivery_type, status)",
            )
            .eq("id", searchOrderId)
            .maybeSingle();

          if (o) {
            const rawItems = (o as any).order_items ?? [];
            parsed = {
              number: o.order_number || searchOrderNumber || o.id.slice(0, 8).toUpperCase(),
              orderId: o.id,
              email: o.customer_email || "",
              total: Number(o.total) || 0,
              currency: "EGP",
              paymentGateway: (o as any).payment_gateway || "paypal",
              items: rawItems.map((it: any) => ({
                name: it.product_name || "خدمة رقمية",
                mode:
                  it.status === "delivered"
                    ? "instant_delivered"
                    : it.delivery_type === "instant"
                      ? "instant_pending"
                      : "manual",
              })),
            };
          }
        } catch (e) {
          console.error("Failed fetching order by search query ID", e);
        }
      }

      if (parsed) {
        if (!Array.isArray(parsed.items)) {
          parsed.items = [];
        }
      }

      setOrder(parsed);
      setLoading(false);

      // Meta Pixel: fire Purchase once per order with explicit /order-success URL context
      if (parsed && !tracked.current) {
        tracked.current = true;
        const safeItems = Array.isArray(parsed.items) ? parsed.items : [];
        const currentUrl = typeof window !== "undefined" ? window.location.href : "";
        const fallbackUrl = `https://rapidkeyz.com/order-success?order_id=${encodeURIComponent(parsed.orderId)}&order_number=${encodeURIComponent(parsed.number)}`;
        const successUrl = currentUrl.includes("order_id=") ? currentUrl : fallbackUrl;

        try {
          trackPurchase({
            orderId: parsed.orderId,
            total: Number(parsed.total) || 0,
            currency: parsed.currency || "EGP",
            items: safeItems.map((it) => ({ name: it.name, quantity: 1 })),
          });

          // CAPI Event with exact order success URL
          trackMetaCapiServerFn({
            data: {
              eventName: "Purchase",
              eventId: parsed.orderId,
              userEmail: parsed.email,
              sourceUrl: successUrl,
              customData: {
                value: Number(parsed.total) || 0,
                currency: parsed.currency || "EGP",
                content_ids: safeItems.map((it) => it.name),
                num_items: safeItems.length,
              },
            },
          }).catch(() => { });
        } catch { }

        // Prevent a refresh from counting the same purchase twice.
        try {
          sessionStorage.removeItem(LAST_ORDER_KEY);
        } catch { }
      }
    }

    loadOrderData();
  }, [searchOrderId, searchOrderNumber]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-3 sm:px-6">
        {loading ? (
          <div className="py-10 sm:py-14">
            <div className="h-56 animate-pulse rounded-2xl bg-card sm:rounded-3xl" />
            <div className="mt-4 h-40 animate-pulse rounded-2xl bg-card sm:rounded-3xl" />
          </div>
        ) : order ? (
          <>
            {/* ── Celebration cover ── */}
            <section className="relative mt-3 overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] p-6 text-center text-white sm:mt-5 sm:rounded-3xl sm:p-10">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.25) 0, transparent 28%)",
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/30 via-transparent to-transparent"
              />
              <div className="relative">
                <div className="mx-auto grid size-20 animate-in zoom-in-95 place-items-center rounded-full bg-white shadow-2xl ring-4 ring-white/40 sm:size-24">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-10 text-success sm:size-12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h1 className="mt-4 text-2xl font-black tracking-tight drop-shadow-md sm:text-4xl">
                  {lang === "ar" ? "تمام، طلبك اتأكد!" : "All set - order confirmed!"}
                </h1>
                <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-white/85 drop-shadow sm:text-sm">
                  {lang === "ar"
                    ? "شكراً لثقتك! استلمنا طلبك وشغالين عليه دلوقتي - بياناتك في الطريق."
                    : "Thanks for trusting us! We got your order and we're on it right now."}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-4 py-1.5 font-mono text-sm font-black backdrop-blur-md">
                    #{order.number}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-sm font-black tabular-nums backdrop-blur-md">
                    {order.total} {t.common.currency}
                  </span>
                </div>
              </div>
            </section>

            {/* ── Details + summary ── */}
            <div className="mt-4 grid items-start gap-4 sm:mt-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
              {/* Items */}
              <section
                aria-label={lang === "ar" ? "الخدمات المطلوبة" : "Ordered items"}
                className="min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:rounded-3xl sm:p-6"
              >
                <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold">
                  <span className="h-4 w-1 rounded-full bg-brand" />
                  {lang === "ar"
                    ? "طلبك فيه إيه"
                    : "What's in your order"}
                </h2>
                <ul className="space-y-2.5">
                  {(order.items || []).map((it, i) => {
                    const delivered = it.mode === "instant_delivered";
                    return (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-background/50 p-3.5 transition-colors hover:border-brand/40"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold">{it.name}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {delivered ? (
                                lang === "ar" ? (
                                  <>
                                    تم إرسال البيانات إلى{" "}
                                    <span className="font-bold text-foreground">{order.email}</span>
                                  </>
                                ) : (
                                  <>
                                    Sent to{" "}
                                    <span className="font-bold text-foreground">{order.email}</span>
                                  </>
                                )
                              ) : it.mode === "manual" ? (
                                lang === "ar" ? (
                                  "هنكلمك على واتساب أول ما نجهّز اشتراكك."
                                ) : (
                                  "We'll message you on WhatsApp once it's ready."
                                )
                              ) : lang === "ar" ? (
                                "بنجهّز بيانات اشتراكك دلوقتي."
                              ) : (
                                "Getting your details ready now."
                              )}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black sm:text-[11px] ${delivered
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-warning/30 bg-warning/10 text-warning"
                            }`}
                        >
                          {delivered
                            ? lang === "ar"
                              ? "تم التسليم"
                              : "Delivered"
                            : lang === "ar"
                              ? "جاري التسليم"
                              : "Processing"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Summary + CTAs */}
              <aside className="min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:rounded-3xl sm:p-5 lg:sticky lg:top-[calc(var(--app-header-h,56px)+16px)]">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      {lang === "ar" ? "رقم الطلب" : "Order Number"}
                    </dt>
                    <dd className="font-mono font-extrabold tabular-nums">#{order.number}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      {lang === "ar" ? "وسيلة الدفع" : "Payment Method"}
                    </dt>
                    <dd>
                      <span className="rounded-full border border-brand/25 bg-brand/10 px-2.5 py-0.5 text-[11px] font-bold text-brand">
                        {formatGatewayLabel(order.paymentGateway, lang)}
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-2xl border border-brand/20 bg-gradient-to-l from-brand/[0.08] to-transparent px-3.5 py-3">
                    <dt className="text-sm font-bold">{lang === "ar" ? "الإجمالي" : "Total"}</dt>
                    <dd className="text-xl font-black text-brand-deep tabular-nums sm:text-2xl">
                      {order.total}{" "}
                      <span className="text-xs font-bold text-muted-foreground">
                        {t.common.currency}
                      </span>
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-col gap-2">
                  <SiteButton
                    variant="gradient"
                    size="lg"
                    onClick={() => navigate({ to: signedIn ? "/dashboard" : "/" })}
                    className="w-full"
                  >
                    {signedIn
                      ? lang === "ar"
                        ? "متابعة الطلبات في حسابي"
                        : "Go to My Dashboard"
                      : lang === "ar"
                        ? "الرجوع للصفحة الرئيسية"
                        : "Back to Home"}
                  </SiteButton>
                  <SiteButton variant="outline" size="lg" asChild className="w-full">
                    <Link to="/shop">{lang === "ar" ? "متابعة التسوق" : "Continue Shopping"}</Link>
                  </SiteButton>
                </div>
              </aside>
            </div>

            {/* ── What's next ── */}
            <section
              aria-label={lang === "ar" ? "الخطوات التالية" : "What happens next"}
              className="mt-4 grid gap-2 sm:mt-6 sm:grid-cols-3 sm:gap-3"
            >
              {[
                {
                  icon: Check,
                  title: lang === "ar" ? "طلبك اتسجّل" : "Order logged",
                  desc:
                    lang === "ar"
                      ? "استلمناه وبدأنا التنفيذ على طول"
                      : "Received, and we're already on it",
                },
                {
                  icon: Mail,
                  title: lang === "ar" ? "تابع إيميلك" : "Watch your inbox",
                  desc:
                    lang === "ar"
                      ? "بيانات التفعيل توصلك على الإيميل والواتساب"
                      : "Login details arrive by email & WhatsApp",
                },
                {
                  icon: lang === "ar" ? Truck : PartyPopper,
                  title: lang === "ar" ? "توصيل سريع" : "Enjoy",
                  desc:
                    lang === "ar"
                      ? "تفعيل مضمون، ولو حاجة وقفت نبدّلها"
                      : "Guaranteed to work, or we replace it",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card p-3.5"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-extrabold sm:text-[13px]">{title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground sm:text-xs">
                      {desc}
                    </span>
                  </span>
                </div>
              ))}
            </section>
            <div className="pb-8 sm:pb-10" />
          </>
        ) : (
          <div className="grid place-items-center px-3 py-14 text-center sm:py-20">
            <div className="w-full max-w-md rounded-2xl border border-dashed border-border/70 bg-card p-8 sm:rounded-3xl">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {lang === "ar"
                  ? "لو طلبت مننا قريب، هتلاقي طلبك وتفاصيله في صفحة حسابك."
                  : "Ordered recently? You'll find it with all details in your account."}
              </p>
              <SiteButton
                variant="gradient"
                onClick={() => navigate({ to: signedIn ? "/dashboard" : "/" })}
                className="mt-4 w-full"
              >
                {signedIn
                  ? lang === "ar"
                    ? "حسابي"
                    : "My Account"
                  : lang === "ar"
                    ? "الصفحة الرئيسية"
                    : "Home"}
              </SiteButton>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

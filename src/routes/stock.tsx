import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import {
  Lock, RefreshCw, Boxes, PackageCheck, AlertTriangle, Send, StickyNote,
  Copy, Undo2, Minus, Plus, UserCircle2, Package, Sparkles, CheckCircle2, Phone,
  Search, X, Check, Store,
} from "lucide-react";

import { useApp } from "@/contexts/AppContext";
import {
  getStockAppData, issueStock, revertIssue,
  type IssueResult,
} from "@/lib/stock-sheet.functions";

import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SiteButton } from "@/components/ui/site-button";
import { filterName, filterPhone } from "@/lib/input-filters";


export const Route = createFileRoute("/stock")({
  component: StockPage,
});

type Access = { signedIn: boolean; hasAccess: boolean; staffName: string };

function StockPage() {
  const navigate = useNavigate();
  const access = useQuery({
    queryKey: ["stock-access"],
    queryFn: async (): Promise<Access> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return { signedIn: false, hasAccess: false, staffName: "" };
      const [{ data: hasAccess }, { data: profile }] = await Promise.all([
        supabase.rpc("current_user_stock_access"),
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      ]);
      return {
        signedIn: true,
        hasAccess: !!hasAccess,
        staffName: profile?.display_name || user.email || "Staff",
      };
    },
    staleTime: 5_000,
  });

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        access.refetch();
      }
    });
    return () => {
      sub.data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (access.isLoading || !access.data) return;
    if (!access.data.signedIn || !access.data.hasAccess) {
      navigate({ to: "/", replace: true });
    }
  }, [access.isLoading, access.data, navigate]);

  const allowed = access.data?.signedIn && access.data?.hasAccess;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-10">
        {!allowed ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">جارٍ التحويل...</div>
        ) : (
          <StockDispenser staffName={access.data!.staffName} />
        )}
      </main>
      <Footer />
    </div>
  );
}


function AccessGate({ title, description, cta }: { title: string; description: string; cta?: React.ReactNode }) {
  return (
    <div className="max-w-md mx-auto mt-8 sm:mt-16 px-2">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden bg-card border border-border rounded-3xl p-7 sm:p-9 shadow-2xl text-center"
      >
        <div aria-hidden className="pointer-events-none absolute -top-16 -end-16 w-48 h-48 bg-brand/20 blur-3xl rounded-full" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -start-16 w-48 h-48 bg-blue-500/15 blur-3xl rounded-full" />
        <div className="relative">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black">{title}</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
          {cta ? <div className="mt-5 flex justify-center">{cta}</div> : null}
        </div>
      </motion.div>
    </div>
  );
}

function StockDispenser({ staffName }: { staffName: string }) {
  const { notify, confirm } = useApp();
  const qc = useQueryClient();
  const fetcher = useServerFn(getStockAppData);
  const issueFn = useServerFn(issueStock);
  const revertFn = useServerFn(revertIssue);

  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [productName, setProductName] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IssueResult | null>(null);

  const q = useQuery({
    queryKey: ["stock-app-data"],
    queryFn: () => fetcher(),
    // Near-live: poll every 5s and treat data as immediately stale so a change
    // in the linked Google Sheet shows up here without a manual refresh.
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    retry: (count, err: any) => {
      const msg = String(err?.message ?? "");
      if (msg.includes(" 429")) return false;
      return count < 2;
    },
  });

  // Changing the sheet link in the dashboard must switch the displayed data
  // right away, not on the next natural poll.
  useEffect(() => {
    const ch = supabase
      .channel("stock-settings-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_settings" },
        () => q.refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const products = q.data?.products ?? [];
  const selected = products.find((p) => p.productName === productName);

  const visibleProducts = useMemo(() => {
    const s = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (lowOnly && p.availableCount > 3) return false;
      if (!s) return true;
      return p.productName.toLowerCase().includes(s);
    });
  }, [products, productSearch, lowOnly]);

  const stockHealth = useMemo(() => {
    if (!selected) return { label: "لا يوجد اختيار", tone: "bg-muted text-muted-foreground" };
    if (selected.availableCount === 0) return { label: "فارغ", tone: "bg-destructive/15 text-destructive" };
    if (selected.availableCount <= 3) return { label: "منخفض", tone: "bg-amber-500/15 text-amber-500" };
    return { label: "جيد", tone: "bg-emerald-500/15 text-emerald-500" };
  }, [selected]);

  const availableNow = selected?.availableCount ?? 0;
  const canDeliver = !busy && customerName.trim() && productName && qty > 0 && qty <= availableNow;

  const doIssue = async () => {
    if (!canDeliver) return notify("اكمل بيانات التسليم أولاً", "error");
    setBusy(true);
    setResult(null);
    try {
      const res = await issueFn({
        data: {
          customerName: customerName.trim(),
          customerWhatsapp: customerWhatsapp.trim(),
          productName,
          qty,
        },
      });
      setResult(res);
      notify("تم تسليم الأكواد", "success");
      setCustomerName("");
      setCustomerWhatsapp("");
      q.refetch();
    } catch (e: any) {
      notify(e?.message ?? "حصل خطأ", "error");
    } finally {
      setBusy(false);
    }
  };

  const doRevert = async () => {
    if (!result?.orderId) return;
    const ok = await confirm({
      title: "إرجاع للمخزون",
      message: "هل أنت متأكد أن الكود لم يتم استلامه وتريد إرجاع آخر صرف للمخزون؟",
      tone: "danger",
      confirmLabel: "أرجِع",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await revertFn({ data: { orderId: result.orderId } });
      notify("تم إرجاع الأكواد للمخزون", "success");
      setResult(null);
      q.refetch();
    } catch (e: any) {
      notify(e?.message ?? "حصل خطأ", "error");
    } finally {
      setBusy(false);
    }
  };

  const copyAll = () => {
    if (!result?.displayText) return;
    navigator.clipboard.writeText(result.displayText).then(() => notify("تم نسخ الأكواد", "success"));
  };
  const copyOne = (text: string) => {
    navigator.clipboard.writeText(text).then(() => notify("تم النسخ", "success"));
  };

  const dec = () => setQty((n: number) => Math.max(1, n - 1));
  const inc = () => setQty((n: number) => Math.min(Math.max(1, availableNow || 5), n + 1));

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* ── Collection cover (site spirit) ── */}
      <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] sm:rounded-3xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.22) 0, transparent 28%)",
          }}
        />
        <Boxes
          aria-hidden
          className="pointer-events-none absolute -bottom-8 end-6 size-36 rotate-[-8deg] text-white/25 select-none sm:size-44"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/40 via-transparent to-transparent"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <div className="min-w-0 flex-1 pb-0.5">
            <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-md">
              <Sparkles className="size-3" />
              تسليم فوري
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
            </p>
            <h1 className="truncate text-lg font-extrabold tracking-tight text-white drop-shadow-md sm:text-2xl">
              أهلاً {staffName}
            </h1>
            <p className="mt-0.5 truncate text-[11px] text-white/85 drop-shadow sm:text-xs">
              {q.data?.totalAvailable ?? 0} كود متاح · {products.length} منتج · من الشيت المرتبط
            </p>
          </div>
          <button
            type="button"
            onClick={() => q.refetch()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-extrabold text-[#0b3fa0] shadow-lg transition hover:brightness-95 active:scale-95 sm:text-sm"
          >
            <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="mt-3 rounded-3xl border border-brand/15 bg-card p-3 shadow-sm sm:mt-4 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StockStat
            icon={<Boxes className="size-4" />}
            value={q.data?.totalAvailable ?? 0}
            label="إجمالي المتاح"
          />
          <StockStat
            icon={<PackageCheck className="size-4" />}
            value={products.length}
            label="المنتجات"
          />
          <button
            type="button"
            onClick={() => setLowOnly((v) => !v)}
            title="عرض المنتجات منخفضة المخزون فقط"
          >
            <StockStat
              icon={<AlertTriangle className="size-4" />}
              value={q.data?.lowStockCount ?? 0}
              label="مخزون منخفض"
              active={lowOnly}
              hint={lowOnly ? "مفعّل - دوس للإلغاء" : undefined}
            />
          </button>
          <StockStat
            icon={<CheckCircle2 className="size-4" />}
            value={selected ? availableNow : "-"}
            label={selected ? `جاهز: ${selected.productName.slice(0, 18)}` : "اختر منتجاً"}
          />
        </div>
      </div>

      {/* ── Delivered result ── */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 overflow-hidden rounded-3xl border border-success/30 bg-card shadow-sm sm:mt-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-l from-emerald-500/15 to-transparent p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-10 place-items-center rounded-2xl bg-emerald-500 text-white shadow">
                <CheckCircle2 className="size-5" />
              </span>
              <div>
                <div className="font-extrabold text-emerald-600">تم التسليم - {result.orderId}</div>
                <div className="text-[11px] text-muted-foreground">الأكواد جاهزة للنسخ والإرسال للعميل</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SiteButton variant="outline" size="sm" onClick={copyAll}>
                <Copy className="size-3.5" /> نسخ الكل
              </SiteButton>
              <SiteButton variant="outline" size="sm" onClick={doRevert} className="!border-destructive/40 !text-destructive hover:!bg-destructive/10">
                <Undo2 className="size-3.5" /> لم يتم الاستلام
              </SiteButton>
            </div>
          </div>
          <div className="grid gap-2 p-4">
            {result.codes.map((c, i) => (
              <div key={i} className="flex items-start justify-between gap-2 rounded-2xl bg-muted/50 p-3">
                <pre className="m-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs" dir="ltr">{c.displayText}</pre>
                <button
                  onClick={() => copyOne(c.displayText)}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-brand/10 hover:text-brand"
                  title="نسخ"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Picker + ticket (the new layout) ── */}
      <div className="mt-3 grid gap-3 sm:mt-4 lg:grid-cols-[1fr_380px] lg:gap-4">
        {/* Product picker */}
        <section className="min-w-0 rounded-3xl border border-brand/15 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-extrabold sm:text-lg">
              <span className="grid size-8 place-items-center rounded-xl bg-brand/10 text-brand">
                <Store className="size-4" />
              </span>
              اختر المنتج
              {visibleProducts.length > 0 && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-black text-brand tabular-nums">
                  {visibleProducts.length}
                </span>
              )}
            </h2>
            {lowOnly && (
              <button
                onClick={() => setLowOnly(false)}
                className="text-xs font-bold text-brand hover:underline"
              >
                إلغاء فلتر المنخفض
              </button>
            )}
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 size-4 text-muted-foreground" />
            <input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="دوّر على منتج..."
              className="w-full rounded-full border border-border bg-card py-2.5 ps-9 pe-9 text-sm outline-none transition-colors focus:border-brand"
            />
            {productSearch && (
              <button
                type="button"
                onClick={() => setProductSearch("")}
                aria-label="مسح البحث"
                className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {visibleProducts.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              {q.isLoading ? "جارٍ التحميل..." : "لا توجد منتجات مطابقة"}
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visibleProducts.map((p) => {
                const active = p.productName === productName;
                const empty = p.availableCount === 0;
                const low = !empty && p.availableCount <= 3;
                return (
                  <button
                    key={p.productName}
                    type="button"
                    disabled={empty}
                    onClick={() => {
                      setProductName(active ? "" : p.productName);
                      setQty(1);
                    }}
                    className={`relative flex items-center gap-3 rounded-2xl border p-3 text-start transition active:scale-[0.98] disabled:opacity-50 ${active
                        ? "border-brand/60 bg-brand/[0.06] shadow-[0_10px_25px_-12px_rgba(0,169,224,0.6)]"
                        : "border-border/60 bg-card hover:border-brand/40 hover:shadow-sm"
                      }`}
                  >
                    <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00a9e0] to-[#0b3fa0] text-sm font-black text-white">
                      {p.productName.trim().slice(0, 1).toUpperCase()}
                      <span
                        className={`absolute -bottom-0.5 -end-0.5 size-3 rounded-full ring-2 ring-white ${empty ? "bg-destructive" : low ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{p.productName}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
                        متاح <b className={empty ? "text-destructive" : low ? "text-amber-500" : "text-emerald-500"}>{p.availableCount}</b>
                        {p.notes ? " · له ملاحظات" : ""}
                      </span>
                    </span>
                    {active ? (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-white">
                        <Check className="size-4" />
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-black tabular-nums">
                        ×1
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Delivery ticket (sticky) */}
        <aside className="h-fit lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-3xl border border-brand/15 bg-card shadow-sm">
            <div className="bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] p-4 text-white">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-extrabold drop-shadow">تذكرة التسليم</h2>
                <span className={`inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold backdrop-blur`}>
                  <span className="size-1.5 rounded-full bg-current" /> {stockHealth.label}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white/15 p-2.5 backdrop-blur">
                <UserCircle2 className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{staffName}</span>
                <span className="shrink-0 text-[10px] font-bold text-white/70">موظف</span>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white/15 p-2.5 backdrop-blur">
                <Package className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {selected ? selected.productName : "لم يتم اختيار منتج"}
                </span>
                {selected && (
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-[#0b3fa0] tabular-nums">
                    {availableNow}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <UserCircle2 className="size-3.5 text-brand-deep" /> اسم العميل
                </span>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(filterName(e.target.value))}
                  placeholder="اكتب اسم العميل"
                  className="w-full rounded-full border border-border bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-brand"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <Phone className="size-3.5 text-brand-deep" /> واتس العميل (اختياري)
                </span>
                <input
                  type="tel"
                  dir="ltr"
                  value={customerWhatsapp}
                  onChange={(e) => setCustomerWhatsapp(filterPhone(e.target.value, 20))}
                  placeholder="+20…"
                  className="w-full rounded-full border border-border bg-card px-4 py-2.5 text-start text-sm outline-none transition-colors focus:border-brand"
                />
              </label>

              <div>
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <Boxes className="size-3.5 text-brand-deep" /> الكمية
                </span>
                <div className="flex items-center justify-between rounded-full border border-border bg-card p-1">
                  <button
                    type="button"
                    onClick={dec}
                    aria-label="إنقاص"
                    className="grid size-9 place-items-center rounded-full transition hover:bg-muted active:scale-95"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="text-lg font-black tabular-nums">{qty}</span>
                  <button
                    type="button"
                    onClick={inc}
                    aria-label="زيادة"
                    className="grid size-9 place-items-center rounded-full transition hover:bg-muted active:scale-95"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>

              <SiteButton
                variant="primary"
                size="lg"
                onClick={doIssue}
                disabled={!canDeliver}
                className="w-full"
              >
                <Send className="size-4" />
                {busy ? "جارٍ التسليم..." : "تسليم الآن"}
              </SiteButton>

              {selected?.notes ? (
                <details className="rounded-2xl border border-amber-500/30 bg-amber-500/5">
                  <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-bold text-amber-600">
                    <StickyNote className="size-4" />
                    ملاحظات المنتج
                  </summary>
                  <p className="whitespace-pre-wrap border-t border-amber-500/20 p-3 text-xs leading-relaxed">
                    {selected.notes}
                  </p>
                </details>
              ) : (
                <p className="flex items-start gap-2 rounded-2xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" />
                  النظام يسحب أول أكواد متاحة تلقائياً - ولو الكود لم يُسلَّم اضغط «لم يتم الاستلام» لإرجاعه.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        البيانات تتحدث تلقائياً كل 5 ثوانٍ من الشيت المرتبط -{" "}
        <Link to="/" className="font-bold text-brand hover:underline">
          العودة للرئيسية
        </Link>
      </p>
    </div>
  );
}

function StockStat({
  icon,
  value,
  label,
  active,
  hint,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  active?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-3 text-center transition ${active ? "border-brand/50 bg-brand/10" : "border-transparent bg-muted/50"
        }`}
      title={hint}
    >
      <span className="mx-auto mb-1 grid size-8 place-items-center rounded-full bg-white text-brand-deep shadow-sm ring-1 ring-border/60">
        {icon}
      </span>
      <span className="block text-lg font-black leading-tight tabular-nums sm:text-xl">{value}</span>
      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground sm:text-xs">{label}</span>
    </div>
  );
}

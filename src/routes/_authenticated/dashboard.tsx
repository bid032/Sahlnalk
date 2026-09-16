import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { Copy, Check } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { getMyOrders } from "@/lib/my-orders.functions";

import type { User } from "@supabase/supabase-js";
import { deliveredList } from "@/lib/delivered";
import { getOrderStatusConfig } from "@/lib/order-status";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type CredRow = { label: string; value: string };

function parseNotesAndImage(notes?: string | null) {
  if (!notes) return { cleanNotes: null, imageUrl: null };
  let cleanNotes = notes.trim();
  let imageUrl: string | null = null;
  const match = cleanNotes.match(/\[image\]:\s*(https?:\/\/[^\s]+)/i);
  if (match) {
    imageUrl = match[1];
    cleanNotes = cleanNotes.replace(/\[image\]:\s*https?:\/\/[^\s]+/gi, "").trim();
  }
  return { cleanNotes: cleanNotes || null, imageUrl };
}

function looksLikeActivationKey(v?: string | null): boolean {
  if (!v) return false;
  const s = v.trim();
  if (!s || s.includes("@") || /\s/.test(s)) return false;
  if (/^[A-Z0-9]{4,}(-[A-Z0-9]{4,}){1,}$/i.test(s)) return true;
  if (/^[A-Z0-9]{16,}$/.test(s)) return true;
  return false;
}

function buildCredentialRows(acc: any, lang: "ar" | "en"): CredRow[] {
  const L = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const rows: CredRow[] = [];
  const email = acc.account_email?.trim();
  const username = acc.account_username?.trim();
  const password = acc.account_password?.trim();

  // Activation-key detection: a lone key value stored in username or password.
  if (!email && username && !password && looksLikeActivationKey(username)) {
    rows.push({ label: L("مفتاح التفعيل", "Activation Key"), value: username });
    return rows;
  }
  if (!email && !username && password && looksLikeActivationKey(password)) {
    rows.push({ label: L("مفتاح التفعيل", "Activation Key"), value: password });
    return rows;
  }

  if (email) rows.push({ label: L("البريد", "Email"), value: email });
  if (username) rows.push({ label: L("اسم المستخدم", "Username"), value: username });
  if (password) rows.push({ label: L("كلمة السر", "Password"), value: password });
  return rows;
}

function Dashboard() {
  const { t, lang } = useApp();
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const profile = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, phone, country")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });
  const displayName =
    profile.data?.display_name?.trim() ||
    (user?.user_metadata as any)?.full_name ||
    (user?.user_metadata as any)?.name ||
    user?.email?.split("@")[0] ||
    "";

  // Force profile completion for Google/social sign-ups missing WhatsApp or country.
  useEffect(() => {
    if (!user || !profile.data) return;
    const missing = !profile.data.phone?.trim() || !profile.data.country?.trim();
    if (missing) navigate({ to: "/account", search: { complete: "1" } });
  }, [user, profile.data, navigate]);

  const orders = useQuery({
    queryKey: ["my-orders", user?.id, user?.email],
    enabled: !!user,
    queryFn: async () => {
      // Loaded server-side so guest-checkout orders placed with the same email
      // (user_id = NULL) also show up in the customer's account.
      const data = await getMyOrders();
      return (data as any[]) ?? [];
    },
  });



  const refunds = useQuery({
    queryKey: ["my-refunds", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("refunds")
        .select("id, order_id, order_item_id, amount, type, notes, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const fullRefundByOrder = new Map<string, any>();
  const refundByItem = new Map<string, any>();
  (refunds.data ?? []).forEach((r: any) => {
    if (r.type === "full" && r.order_id && !r.order_item_id) {
      fullRefundByOrder.set(r.order_id, r);
    }
    if (r.order_item_id) {
      refundByItem.set(r.order_item_id, r);
    }
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const uniqueOrders = useMemo(() => {
    const map = new Map<string, any>();
    for (const o of orders.data ?? []) {
      const key = o.id || o.order_number;
      if (key && !map.has(key)) {
        map.set(key, o);
      }
    }
    return Array.from(map.values());
  }, [orders.data]);

  const orderCount = uniqueOrders.length;
  const activeCount = uniqueOrders.filter((o: any) =>
    ["pending", "paid", "processing"].includes(o.status)).length;
  const doneCount = uniqueOrders.filter((o: any) => o.status === "delivered").length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="mx-auto w-full max-w-6xl px-3 sm:px-6">
        {/* Profile card */}
        <div className="mt-3 rounded-3xl border border-brand/15 bg-card p-4 shadow-sm sm:mt-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#00a9e0] to-[#0b3fa0] text-xl font-black text-white sm:size-16">
                {(displayName || user?.email || "؟").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold sm:text-xl">
                  {lang === "ar" ? "أهلاً" : "Welcome"}، {displayName || (lang === "ar" ? "صديقنا" : "friend")}
                </div>
                <div className="truncate text-xs text-muted-foreground sm:text-sm" dir="ltr">
                  {user?.email ?? ""}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ms-auto">
              <Link to="/account" className="rounded-full border border-border bg-card px-4 py-2 text-sm font-bold transition hover:border-brand/60 hover:text-brand active:scale-95">
                {lang === "ar" ? "معلومات الحساب" : "Account info"}
              </Link>
              <button
                onClick={handleSignOut}
                className="rounded-full border border-border px-4 py-2 text-sm font-bold transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              >
                {t.nav.logout}
              </button>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-4">
            {[
              { n: orderCount, l: lang === "ar" ? "طلباتي" : "Orders" },
              { n: activeCount, l: lang === "ar" ? "قيد التنفيذ" : "In progress" },
              { n: doneCount, l: lang === "ar" ? "تم تسليمها" : "Delivered" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-muted/50 px-3 py-2.5 text-center">
                <dd className="text-lg font-black text-brand-deep sm:text-xl">{s.n}</dd>
                <dt className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{s.l}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7">

        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4">{t.dashboard.myOrders}</h2>
          {orders.isLoading && <p className="text-muted-foreground">{t.common.loading}</p>}
          {!orders.isLoading && uniqueOrders.length === 0 && (
            <div className="p-8 border border-dashed border-border rounded-2xl text-center">
              <p className="text-muted-foreground mb-4">{t.dashboard.noOrders}</p>
              <Link to="/shop" className="text-brand font-bold hover:underline">
                {t.cart.goShopping}
              </Link>
            </div>
          )}
          <div className="space-y-4">
            {uniqueOrders.map((o: any) => {
              const statusCfg = getOrderStatusConfig(o.status, lang);
              return (
              <div key={o.id} className={`p-4 sm:p-6 bg-card border rounded-2xl transition-all ${statusCfg.cardClass}`}>
                <div className="flex justify-between items-start mb-4 gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-bold text-base sm:text-lg flex items-center gap-2">
                      <span>{t.dashboard.order} #{o.order_number}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(o.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", { hour12: true })}
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black inline-flex items-center gap-1 ${statusCfg.badgeClass}`}
                    >
                      {statusCfg.label}
                    </span>
                    {Number(o.discount_amount ?? 0) > 0 && (
                      <div className="mt-1 text-[11px] leading-tight">
                        <div className="text-muted-foreground">
                          {lang === "ar" ? "قبل الخصم" : "Before"}:{" "}
                          <span className="line-through">
                            {o.subtotal} {t.common.currency}
                          </span>
                        </div>
                        <div className="text-success font-bold">
                          {lang === "ar" ? "خصم" : "Discount"} −{o.discount_amount} {t.common.currency}
                          {o.coupons?.code && <span className="ms-1 font-mono">({o.coupons.code})</span>}
                        </div>
                      </div>
                    )}
                    <div className="text-lg font-extrabold mt-2 text-brand">
                      {o.total} {t.common.currency}
                    </div>
                  </div>
                </div>
                {(() => {
                  const fullRefund = fullRefundByOrder.get(o.id);
                  const isCancelled = o.status === "cancelled" || o.status === "canceled";
                  const isRefunded = o.status === "refunded";
                  if (fullRefund || isCancelled || isRefunded) {
                    const reason = fullRefund?.notes?.trim();
                    const refundedFlag = !!fullRefund || isRefunded;
                    const title = refundedFlag
                      ? lang === "ar"
                        ? "تم استرداد قيمة الطلب"
                        : "Order refunded"
                      : lang === "ar"
                        ? "تم إلغاء الطلب"
                        : "Order cancelled";
                    const fallback =
                      lang === "ar"
                        ? "لا يمكن عرض بيانات الحساب لأن الطلب " + (refundedFlag ? "تم استرداده." : "تم إلغاؤه.")
                        : "Account details are unavailable because the order has been " +
                          (refundedFlag ? "refunded." : "cancelled.");
                    return (
                      <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg text-center">
                        <div className="text-sm font-bold text-destructive mb-1">{title}</div>
                        <div className="text-xs text-muted-foreground">{reason || fallback}</div>
                      </div>
                    );
                  }

                  if (o.status === "processing") {
                    return (
                      <div className="p-4 bg-warning/5 border border-warning/20 rounded-lg text-center">
                        <div className="text-sm font-bold text-warning mb-1">
                          {lang === "ar" ? "الطلب تحت التجهيز" : "Order is being processed"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {lang === "ar"
                            ? "جاري تجهيز الاشتراك وسيتم التواصل معك قريباً."
                            : "We're preparing your subscription and will contact you shortly."}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {o.order_items?.map((it: any) => {
                        const itemRefund = refundByItem.get(it.id);
                        return (
                          <div key={it.id} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex justify-between items-center gap-2 flex-wrap">
                              <div className="text-sm min-w-0">
                                <span className="font-bold">{it.product_name}</span>{" "}
                                <span className="text-muted-foreground">
                                  , {it.plan_label} × {it.quantity}
                                </span>
                              </div>
                              <div className="text-sm font-bold shrink-0">
                                {Number(it.frozen_unit_price ?? it.unit_price) * it.quantity} {t.common.currency}
                              </div>
                            </div>
                            {itemRefund && itemRefund.type === "full" ? (
                              <div className="mt-2 p-3 bg-destructive/5 border border-destructive/20 rounded text-center">
                                <div className="text-xs font-bold text-destructive mb-1">
                                  {lang === "ar" ? "تم استرداد قيمة هذه الخدمة" : "This item has been refunded"}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {itemRefund.notes?.trim() ||
                                    (lang === "ar"
                                      ? "بيانات الحساب لم تعد متاحة."
                                      : "Account details are no longer available.")}
                                </div>
                              </div>
                            ) : (
                              <>
                                {itemRefund && itemRefund.type === "partial" && (
                                  <div className="mt-2 p-2.5 bg-warning/5 border border-warning/30 rounded text-center">
                                    <div className="text-xs font-bold text-warning mb-0.5">
                                      {lang === "ar"
                                        ? `تم استرداد جزئي بمبلغ ${itemRefund.amount} ${t.common.currency}`
                                        : `Partial refund of ${itemRefund.amount} ${t.common.currency}`}
                                    </div>
                                    {itemRefund.notes?.trim() && (
                                      <div className="text-[11px] text-muted-foreground">{itemRefund.notes}</div>
                                    )}
                                  </div>
                                )}
                                {it.status === "delivered" &&
                                deliveredList(it.delivered_accounts).length > 0 ? (
                                  deliveredList(it.delivered_accounts).map(
                                    (acc: any) => {
                                      const rows = buildCredentialRows(acc, lang);
                                      return (
                                        <div
                                          key={acc.id}
                                          className="mt-2 p-3 bg-success/5 border border-success/20 rounded space-y-1.5"
                                        >
                                          <div className="text-[11px] font-bold text-success mb-1">
                                            {lang === "ar" ? "✓ تم التسليم" : "✓ Delivered"}
                                          </div>
                                          {rows.map((r, i) => (
                                            <CopyRow key={i} label={r.label} value={r.value} lang={lang} />
                                          ))}
                                          {(() => {
                                            const { cleanNotes, imageUrl } = parseNotesAndImage(acc.extra_notes);
                                            return (
                                              <>
                                                {cleanNotes && (
                                                  <div className="text-xs text-muted-foreground pt-1 border-t border-success/10">
                                                    <span className="font-bold text-foreground">{lang === "ar" ? "ملاحظات: " : "Notes: "}</span>
                                                    {cleanNotes}
                                                  </div>
                                                )}
                                                {imageUrl && (
                                                  <div className="mt-2 pt-2 border-t border-success/10">
                                                    <div className="text-[11px] font-bold text-muted-foreground mb-1">
                                                      🖼️ {lang === "ar" ? "صورة الإثبات / المرفق:" : "Proof Attachment:"}
                                                    </div>
                                                    <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="inline-block group">
                                                      <img
                                                        src={imageUrl}
                                                        alt="Proof"
                                                        className="max-h-48 max-w-full rounded-lg border border-border bg-black/40 object-contain hover:opacity-90 transition"
                                                      />
                                                      <span className="text-[10px] text-brand underline block mt-1">
                                                        {lang === "ar" ? "اضغط لفتح الصورة بحجم كامل 🔗" : "Click to view full size 🔗"}
                                                      </span>
                                                    </a>
                                                  </div>
                                                )}
                                              </>
                                            );
                                          })()}
                                        </div>
                                      );
                                    },
                                  )
                                ) : (
                                  <div className="mt-2 p-3 bg-warning/5 border border-warning/20 rounded text-xs text-muted-foreground text-center">
                                    {lang === "ar"
                                      ? "⏳ طلبك قيد المراجعة، سيتم عرض بيانات الحساب هنا فور اعتماد التسليم"
                                      : "⏳ Your order is under review. Credentials will appear here once delivered."}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );})}
          </div>
        </section>

        {refunds.data && refunds.data.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-4">{lang === "ar" ? "التعويضات" : "Compensations"}</h2>
            <div className="space-y-3">
              {refunds.data.map((r: any) => (
                <div
                  key={r.id}
                  className="p-4 bg-card border border-border rounded-2xl flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm">
                      {r.type === "full"
                        ? lang === "ar"
                          ? "ريفاند كامل"
                          : "Full refund"
                        : r.type === "partial"
                          ? lang === "ar"
                            ? "ريفاند جزئي"
                            : "Partial refund"
                          : lang === "ar"
                            ? "حساب بديل"
                            : "Replacement account"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
                    </div>
                    {r.notes && <div className="text-xs text-muted-foreground mt-1">{r.notes}</div>}
                  </div>
                  <div className="text-lg font-extrabold text-success">
                    +{r.amount} {t.common.currency}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <Footer />
    </div>
  );
}

function CopyRow({ label, value, lang }: { label: string; value: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-bold text-muted-foreground shrink-0 min-w-[70px]">{label}:</span>
      <code className="flex-1 min-w-0 text-xs font-mono bg-background/60 px-2 py-1 rounded border border-border/60 break-all">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border transition ${
          copied
            ? "bg-success/15 border-success/40 text-success"
            : "bg-brand/10 border-brand/30 text-brand hover:bg-brand hover:text-brand-foreground"
        }`}
        aria-label={lang === "ar" ? "نسخ" : "Copy"}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        <span>{copied ? (lang === "ar" ? "تم" : "Copied") : lang === "ar" ? "نسخ" : "Copy"}</span>
      </button>
    </div>
  );
}

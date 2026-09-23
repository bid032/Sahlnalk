import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ShoppingCart, Zap, Check, ExternalLink, BadgeCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useApp } from "@/contexts/AppContext";
import { SiteButton } from "@/components/ui/site-button";
import { supabase } from "@/integrations/supabase/client";
import type { ProductCardData } from "@/components/ProductCard";
import { stripMd } from "@/lib/strip-md";

type Plan = {
  id: string;
  price: number;
  label_ar: string | null;
  label_en: string | null;
  is_active: boolean;
  sort_order: number | null;
  stock?: number | null;
  account_type?: string | null;
  plan_variant?: string | null;
};

type AcctType = "private" | "shared" | "own";

function parseAcct(pl: Plan): AcctType | "any" {
  const en = String(pl.label_en ?? "");
  const ar = String(pl.label_ar ?? "");
  if (pl.account_type === "private" || pl.account_type === "shared" || pl.account_type === "own") {
    return pl.account_type;
  }
  if (/private/i.test(en) || /خاص|برايفت/i.test(ar)) return "private";
  if (/shared/i.test(en) || /مشترك|شير/i.test(ar)) return "shared";
  if (/\bown\b|our own/i.test(en) || /من عندنا|من عندك|بحسابك|حسابك/i.test(ar)) return "own";
  return "any";
}

const acctMeta = {
  private: { ar: "خاص", en: "Private" },
  shared: { ar: "مشترك", en: "Shared" },
  own: { ar: "خاص", en: "Private" },
} as const;

export function QuickBuyDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: ProductCardData;
}) {
  const { lang, t, addToCart, notify } = useApp() as any;
  const navigate = useNavigate();
  const isAr = lang === "ar";
  const name = isAr ? product.name_ar : product.name_en;
  const desc = isAr ? (product as any).description_ar : (product as any).description_en;
  const discount = Number(product.discount_percent ?? 0);
  const hasDiscount = discount > 0;

  const plansQ = useQuery({
    queryKey: ["quickbuy-plans", product.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_plans")
        .select(
          "id, price, label_ar, label_en, is_active, sort_order, stock, account_type, plan_variant",
        )
        .eq("product_id", product.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      return (data ?? []) as Plan[];
    },
    enabled: open,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const productMetaQ = useQuery({
    queryKey: ["quickbuy-product-meta", product.id],
    queryFn: async () =>
      (await supabase.from("products").select("plan_variants").eq("id", product.id).maybeSingle())
        .data,
    enabled: open,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const productVariants =
    ((productMetaQ.data as any)?.plan_variants as string[] | null)?.filter(Boolean) ?? [];
  const [variant, setVariant] = useState<string | null>(null);
  const effectiveVariant =
    productVariants.length > 0
      ? variant && productVariants.includes(variant)
        ? variant
        : productVariants[0]
      : null;

  const allPlans = plansQ.data ?? [];
  const enriched = useMemo(() => allPlans.map((p) => ({ ...p, acct: parseAcct(p) })), [allPlans]);

  // Normalize "own" → "private" for the user-facing selector
  const rawTypes = Array.from(
    new Set(enriched.map((p) => p.acct).filter((a) => a !== "any")),
  ) as AcctType[];
  const normalizedTypes = Array.from(
    new Set(rawTypes.map((a) => (a === "own" ? "private" : a))),
  ) as ("private" | "shared")[];
  const hasAcctChoice = normalizedTypes.length > 1;

  const [acct, setAcct] = useState<"private" | "shared" | null>(null);
  const effectiveAcct = acct ?? normalizedTypes[0] ?? null;

  const plans = useMemo(() => {
    let list = enriched;
    if (effectiveVariant) {
      list = list.filter((p: any) => !p.plan_variant || p.plan_variant === effectiveVariant);
    }
    if (hasAcctChoice && effectiveAcct) {
      list = list.filter(
        (p) =>
          p.acct === "any" ||
          (effectiveAcct === "private" && (p.acct === "private" || p.acct === "own")) ||
          (effectiveAcct === "shared" && p.acct === "shared"),
      );
    }
    return list;
  }, [enriched, hasAcctChoice, effectiveAcct, effectiveVariant]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!open) return;
    const inStock = (p: { stock?: number | null }) => Number(p?.stock ?? 0) > 0;
    if (plans.length && !plans.find((p) => p.id === selectedId && inStock(p))) {
      const cheap = [...plans]
        .filter(inStock)
        .sort((a, b) => Number(a.price) - Number(b.price))[0];
      setSelectedId(cheap?.id ?? null);
    }
  }, [open, plans, selectedId]);

  const selected = useMemo(() => {
    const inStock = (p: { stock?: number | null }) => Number(p?.stock ?? 0) > 0;
    return (
      plans.find((p) => p.id === selectedId && inStock(p)) ?? plans.find(inStock) ?? null
    );
  }, [plans, selectedId]);

  const rawUnit = selected ? Number(selected.price) : 0;
  const unit = hasDiscount ? Math.round(rawUnit * (100 - discount)) / 100 : rawUnit;
  const total = Math.round(unit * qty * 100) / 100;
  const stock = Number(selected?.stock ?? 0);
  const soldOut = !!selected && stock <= 0;

  const doAdd = async (goCheckout: boolean) => {
    if (!selected) return;
    if (soldOut) {
      notify?.(t.product.soldOut, "error");
      return;
    }
    await addToCart({
      productId: product.id,
      planId: selected.id,
      productName: name,
      planLabel: `${(isAr ? selected.label_ar : selected.label_en) ?? ""}${effectiveVariant ? ` (${effectiveVariant})` : ""}`,
      price: unit,
      quantity: qty,
      iconUrl: product.icon_url ?? null,
      deliveryType: product.delivery_type,
      accountType: product.account_type,
    });
    notify?.(isAr ? "تمت الإضافة للسلة" : "Added to cart", "success");
    if (goCheckout) {
      onOpenChange(false);
      // Client-side navigation: no document reload, no tab spinner, no repaint.
      navigate({ to: "/checkout" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="max-w-lg md:max-w-[min(95vw,1100px)] p-0 overflow-hidden gap-0 border-border/60 bg-card flex flex-col max-h-[calc(100dvh-1rem)] md:max-h-[min(96dvh,760px)]"
      >
        {/* ============ MOBILE LAYOUT ============ */}
        <div className="md:hidden flex flex-col min-h-0 flex-1">
          {/* Mini cover with identity */}
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] px-4 pb-3.5 pt-5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.22) 0, transparent 28%)",
              }}
            />
            {product.icon_url && (
              <img
                src={product.icon_url}
                alt=""
                aria-hidden
                className="pointer-events-none absolute -bottom-5 end-3 size-20 rotate-[-8deg] rounded-2xl object-cover opacity-40 shadow-lg ring-2 ring-white/40 select-none"
              />
            )}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/55 via-[#0b3fa0]/10 to-transparent"
            />
            <DialogHeader className="!text-start space-y-0 pe-12 sm:!text-start">
              <div className="relative flex items-center gap-2.5">
                <span className="block size-11 shrink-0 overflow-hidden rounded-xl bg-white shadow-lg ring-2 ring-white">
                  {product.icon_url ? (
                    <img src={product.icon_url} alt={name} className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-base font-black text-brand">
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="flex items-center gap-1 text-sm font-extrabold leading-tight text-white drop-shadow-md">
                    <span className="truncate">{name}</span>
                    <BadgeCheck className="size-3.5 shrink-0 text-white" aria-hidden />
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 truncate text-[11px] font-semibold text-white/85 drop-shadow">
                    {isAr ? "اختر الخطة والكمية للشراء السريع" : "Pick a plan and quantity"}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          {/* Plans -glass mobile configurator */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">
            {productVariants.length > 0 && (
              <section>
                <h3 className="mb-2.5 flex items-center gap-2 text-sm font-extrabold text-brand">
                  <span className="h-4 w-1 rounded-full bg-brand" />
                  {isAr ? "نوع الخطة" : "Plan"}
                </h3>
                <div
                  className="grid gap-2 p-1.5 rounded-2xl bg-muted/50 border border-border/60"
                  style={{
                    gridTemplateColumns: `repeat(${productVariants.length}, minmax(0,1fr))`,
                  }}
                >
                  {productVariants.map((v) => {
                    const isSel = effectiveVariant === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setVariant(v);
                          setSelectedId(null);
                        }}
                        className={`relative py-3 px-2 rounded-xl text-xs font-bold transition-all focus:outline-none overflow-hidden ${
                          isSel
                            ? "bg-brand text-brand-foreground shadow-lg shadow-brand/20"
                            : "text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <span className="relative block truncate text-center">
                          <bdi>{v}</bdi>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {hasAcctChoice && (
              <section>
                <h3 className="mb-2.5 flex items-center gap-2 text-sm font-extrabold text-brand">
                  <span className="h-4 w-1 rounded-full bg-brand" />
                  {isAr ? "نوع الحساب" : "Account"}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {normalizedTypes.map((a) => {
                    const isSel = effectiveAcct === a;
                    const sub =
                      a === "private"
                        ? isAr
                          ? "تحكم كامل • أجهزة متعددة"
                          : "Full control • Multi-device"
                        : isAr
                          ? "اقتصادي • جهاز واحد"
                          : "Best value • Single device";
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAcct(a)}
                        className={`relative flex flex-col items-center text-center p-3 rounded-2xl border transition-all focus:outline-none overflow-hidden h-full ${
                          isSel
                            ? "border-brand/50 bg-brand/5"
                            : "border-border/60 bg-muted/50 hover:border-border"
                        }`}
                      >
                        {isSel && (
                          <span className="pointer-events-none absolute -top-6 -end-6 w-16 h-16 bg-brand/20 rounded-full blur-2xl" />
                        )}
                        <div
                          className={`shrink-0 size-5 rounded-full border-2 flex items-center justify-center transition-colors mb-2 ${
                            isSel ? "border-brand" : "border-border"
                          }`}
                        >
                          {isSel && <span className="size-2.5 rounded-full bg-brand" />}
                        </div>
                        <div className="min-w-0 relative z-10">
                          <div
                            className={`text-sm font-bold ${isSel ? "text-foreground" : "text-foreground/70"}`}
                          >
                            {acctMeta[a][isAr ? "ar" : "en"]}
                          </div>
                          <div
                            className={`text-[10px] mt-1 leading-relaxed ${isSel ? "text-brand/80" : "text-muted-foreground"}`}
                          >
                            {sub}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-2.5 flex items-center gap-2 text-sm font-extrabold text-brand">
                <span className="h-4 w-1 rounded-full bg-brand" />
                {isAr ? "المدة" : "Duration"}
              </h3>
              {plansQ.isLoading ? (
                <div className="grid grid-cols-2 gap-2.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-20 rounded-2xl bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : plans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {isAr ? "لا توجد خطط متاحة" : "No plans available"}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {plans.map((pl) => {
                    const isSel = selected?.id === pl.id;
                    const so = Number(pl.stock ?? 0) <= 0;
                    const raw = Number(pl.price);
                    const price = hasDiscount ? Math.round(raw * (100 - discount)) / 100 : raw;
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => !so && setSelectedId(pl.id)}
                        disabled={so}
                        className={`relative rounded-2xl border-2 p-3 pt-7 text-center transition outline-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                          so
                            ? "border-destructive/30 bg-destructive/5 cursor-not-allowed"
                            : isSel
                              ? "border-brand bg-brand/[0.07] shadow-sm"
                              : "border-border/60 bg-card hover:border-brand/50"
                        }`}
                      >
                        {so ? (
                          <span className="pointer-events-none absolute top-1.5 start-1.5 rounded-md bg-destructive px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-destructive-foreground">
                            {t.product.soldOut}
                          </span>
                        ) : (
                          hasDiscount && (
                            <span className="pointer-events-none absolute top-1.5 start-1.5 rounded-full border border-success/30 bg-success/15 px-1.5 py-0.5 text-[9px] font-black tabular-nums text-success">
                              -{discount}%
                            </span>
                          )
                        )}
                        <div
                          className={`relative flex flex-col items-center gap-1.5 ${so ? "opacity-60" : ""}`}
                        >
                          <div
                            className={`text-sm font-bold leading-tight ${so ? "line-through" : ""}`}
                          >
                            {(isAr ? pl.label_ar : pl.label_en) || (isAr ? "خطة" : "Plan")}
                          </div>
                          <div className="flex items-baseline justify-center gap-1">
                            <span
                              className={`text-lg font-black tabular-nums leading-none ${isSel ? "text-brand" : ""} ${so ? "line-through" : ""}`}
                            >
                              {price}
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {t.common.currency}
                            </span>
                            {hasDiscount && !so && (
                              <span className="text-[10px] text-muted-foreground line-through tabular-nums">
                                {raw}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Footer summary (price-panel language) */}
          {plans.length > 0 && (
            <div className="shrink-0 space-y-3 border-t border-border/60 bg-card px-4 py-3.5">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/60 px-3 py-2.5">
                <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card p-0.5">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="grid size-8 place-items-center rounded-full text-sm text-foreground transition hover:bg-muted"
                    aria-label="decrease"
                  >
                    −
                  </button>
                  <span className="min-w-7 text-center text-sm font-black tabular-nums text-foreground">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(99, q + 1))}
                    className="grid size-8 place-items-center rounded-full text-sm text-foreground transition hover:bg-muted"
                    aria-label="increase"
                  >
                    +
                  </button>
                </div>
                {selected && (
                  <div className="flex min-w-0 flex-col items-end">
                    <span className="text-[9px] font-bold text-muted-foreground">
                      {isAr ? "الإجمالي" : "Total"}
                    </span>
                    <span className="flex items-baseline gap-1">
                      <span
                        className={`text-2xl font-black tabular-nums leading-none ${soldOut ? "text-destructive line-through" : "text-brand-deep"}`}
                      >
                        {soldOut ? t.product.soldOut : total}
                      </span>
                      {!soldOut && (
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {t.common.currency}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <SiteButton
                  variant="primary"
                  size="sm"
                  onClick={() => doAdd(true)}
                  disabled={!selected || soldOut}
                  className="py-3 font-black"
                >
                  <Zap className="size-3.5" />
                  {soldOut ? t.product.soldOut : t.product.buyNow}
                </SiteButton>
                <SiteButton
                  variant="outline"
                  size="sm"
                  onClick={() => doAdd(false)}
                  disabled={!selected || soldOut}
                  className="bg-muted/50 py-3 hover:bg-muted"
                >
                  <ShoppingCart className="size-3.5" />
                  {soldOut ? t.product.soldOut : t.product.addToCart}
                </SiteButton>
              </div>

              <SiteButton variant="dashed" size="sm" asChild className="w-full py-2.5">
                <Link
                  to="/product/$slug"
                  params={{ slug: product.slug }}
                  onClick={() => onOpenChange(false)}
                >
                  <ExternalLink className="size-3.5" />
                  <span>{isAr ? "التفاصيل الكاملة" : "Full details"}</span>
                </Link>
              </SiteButton>
            </div>
          )}
        </div>

        {/* ============ DESKTOP LAYOUT (redesigned) ============ */}
        <div className="hidden md:flex flex-col min-h-0">
          {/* Top cover with identity */}
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#0bb6e4] via-[#00a9e0] to-[#0b3fa0] px-6 pb-4 pt-5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 15% 30%, rgba(255,255,255,.35) 0, transparent 30%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.22) 0, transparent 28%)",
              }}
            />
            {product.icon_url && (
              <img
                src={product.icon_url}
                alt=""
                aria-hidden
                className="pointer-events-none absolute -bottom-6 end-6 size-24 rotate-[-8deg] rounded-2xl object-cover opacity-40 shadow-lg ring-2 ring-white/40 select-none"
              />
            )}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b3fa0]/55 via-[#0b3fa0]/10 to-transparent"
            />
            <DialogHeader className="relative !text-start space-y-0 pe-12 sm:!text-start">
              <div className="flex items-center gap-2.5">
                <span className="block size-12 shrink-0 overflow-hidden rounded-2xl bg-white shadow-lg ring-2 ring-white">
                  {product.icon_url ? (
                    <img src={product.icon_url} alt={name} className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-lg font-black text-brand">
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white/80">
                    {isAr ? "شراء سريع" : "Quick buy"}
                  </p>
                  <DialogTitle className="flex items-center gap-1.5 text-xl font-extrabold leading-tight text-white drop-shadow-md">
                    <span className="truncate">{name}</span>
                    <BadgeCheck className="size-5 shrink-0 text-white" aria-hidden />
                  </DialogTitle>
                </div>
              </div>
              <DialogDescription className="mt-1 line-clamp-2 max-w-2xl text-xs leading-relaxed text-white/85 drop-shadow">
                {stripMd(desc) ||
                  (isAr
                    ? "اختر الخطة والكمية وأتمّ شراءك في ثوانٍ"
                    : "Pick a plan and quantity to check out in seconds")}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Split body -auto height, no scroll */}
          <div className="min-h-0">
            <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-0 items-stretch">
              {/* RIGHT column (start in RTL): image + 3 actions */}
              <aside className="border-e border-border/60 bg-muted/20 p-4 flex flex-col gap-3 min-h-0">
                <div className="relative w-full shrink-0 overflow-hidden rounded-2xl border border-border/60 shadow-lg">
                  {product.cover_url ? (
                    <img
                      src={product.cover_url}
                      alt={name}
                      className="aspect-square w-full object-cover"
                    />
                  ) : product.icon_url ? (
                    <img
                      src={product.icon_url}
                      alt={name}
                      className="aspect-square w-full object-cover"
                      style={{ maxHeight: "220px" }}
                    />
                  ) : (
                    <div
                      className="grid aspect-square w-full place-items-center bg-gradient-to-br from-brand/20 to-transparent text-5xl font-black text-brand"
                      style={{ maxHeight: "220px" }}
                    >
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  {hasDiscount && (
                    <span className="absolute top-2 start-2 rounded-lg bg-destructive px-2 py-0.5 text-[10px] font-black text-destructive-foreground shadow-lg">
                      -{discount}%
                    </span>
                  )}
                </div>

                {/* 3 stacked action buttons */}
                <div className="flex flex-col gap-2 shrink-0 mt-auto">
                  <SiteButton
                    variant="primary"
                    size="sm"
                    onClick={() => doAdd(true)}
                    disabled={!selected || soldOut}
                    className="w-full py-2.5 shadow-lg"
                  >
                    <Zap className="size-3.5" />
                    {soldOut ? t.product.soldOut : t.product.buyNow}
                  </SiteButton>
                  <SiteButton
                    variant="outline"
                    size="sm"
                    onClick={() => doAdd(false)}
                    disabled={!selected || soldOut}
                    className="w-full py-2"
                  >
                    <ShoppingCart className="size-3.5" />
                    {soldOut ? t.product.soldOut : t.product.addToCart}
                  </SiteButton>
                  <SiteButton variant="dashed" size="sm" asChild className="w-full py-2">
                    <Link
                      to="/product/$slug"
                      params={{ slug: product.slug }}
                      onClick={() => onOpenChange(false)}
                    >
                      <ExternalLink className="size-3.5" />
                      <span>{isAr ? "التفاصيل الكاملة" : "Full details"}</span>
                    </Link>
                  </SiteButton>
                </div>
              </aside>

              {/* LEFT column (end in RTL): plans only, fills width, no scroll */}
              <section className="p-4 flex flex-col gap-2.5 min-w-0 min-h-0">
                <div className="flex items-center justify-between shrink-0">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-brand">
                    <span className="h-4 w-1 rounded-full bg-brand" />
                    {isAr ? "اختر الخطة" : "Choose a plan"}
                  </h3>
                  {plans.length > 0 && (
                    <div className="text-[10px] font-bold text-muted-foreground tabular-nums">
                      {plans.length} {isAr ? "خطط متاحة" : "plans available"}
                    </div>
                  )}
                </div>

                {productVariants.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border/60 bg-background/60 p-1.5 shrink-0">
                    {productVariants.map((v) => {
                      const isSel = effectiveVariant === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            setVariant(v);
                            setSelectedId(null);
                          }}
                          className={`rounded-full px-4 py-2 text-xs font-extrabold transition outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                            isSel
                              ? "bg-brand text-white shadow-sm"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                )}

                {hasAcctChoice && (
                  <div
                    className="grid gap-1.5 rounded-2xl border border-border/60 bg-background/60 p-1.5 shrink-0"
                    style={{
                      gridTemplateColumns: `repeat(${normalizedTypes.length}, minmax(0,1fr))`,
                    }}
                  >
                    {normalizedTypes.map((a) => {
                      const isSel = effectiveAcct === a;
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAcct(a)}
                          className={`rounded-full px-3 py-2 text-xs font-extrabold transition outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                            isSel
                              ? "bg-brand text-white shadow-sm"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          {acctMeta[a][isAr ? "ar" : "en"]}
                        </button>
                      );
                    })}
                  </div>
                )}

                {plansQ.isLoading ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : plans.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {isAr ? "لا توجد خطط متاحة" : "No plans available"}
                  </p>
                ) : (
                  <div
                    className={`grid gap-2 content-start auto-rows-min ${
                      plans.length <= 4
                        ? "grid-cols-2"
                        : plans.length <= 9
                          ? "grid-cols-3"
                          : "grid-cols-4"
                    }`}
                  >
                    {plans.map((pl) => {
                      const isSel = selected?.id === pl.id;
                      const so = Number(pl.stock ?? 0) <= 0;
                      const raw = Number(pl.price);
                      const price = hasDiscount ? Math.round(raw * (100 - discount)) / 100 : raw;
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => !so && setSelectedId(pl.id)}
                          disabled={so}
                          className={`relative rounded-2xl border-2 p-2.5 pt-6 text-center transition outline-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                            so
                              ? "border-destructive/30 bg-destructive/5 opacity-60 cursor-not-allowed"
                              : isSel
                                ? "border-brand bg-brand/[0.07] shadow-sm"
                                : "border-border/60 bg-card hover:border-brand/50"
                          }`}
                        >
                          {so ? (
                            <span className="absolute top-1.5 start-1.5 rounded-md bg-destructive px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-destructive-foreground">
                              {t.product.soldOut}
                            </span>
                          ) : (
                            hasDiscount && (
                              <span className="absolute top-1.5 start-1.5 rounded-full border border-success/30 bg-success/15 px-1.5 py-0.5 text-[9px] font-black tabular-nums text-success">
                                -{discount}%
                              </span>
                            )
                          )}
                          {isSel && !so && (
                            <span className="absolute top-1.5 end-1.5 grid place-items-center size-4 rounded-full bg-brand text-brand-foreground shadow">
                              <Check className="size-2.5" />
                            </span>
                          )}
                          <div
                            className={`truncate text-[11px] font-extrabold leading-tight ${so ? "line-through" : ""}`}
                          >
                            {(isAr ? pl.label_ar : pl.label_en) || (isAr ? "خطة" : "Plan")}
                          </div>
                          <div className="mt-1 flex items-baseline justify-center gap-1 flex-wrap">
                            <span
                              className={`text-base font-black tabular-nums leading-none ${isSel ? "text-brand" : ""} ${so ? "line-through" : ""}`}
                            >
                              {price}
                            </span>
                            <span className="text-[9px] text-muted-foreground font-bold">
                              {t.common.currency}
                            </span>
                            {hasDiscount && !so && (
                              <span className="text-[9px] text-muted-foreground line-through tabular-nums">
                                {raw}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Total + qty -sits right after plans, aligned with the details button */}
                {plans.length > 0 && (
                  <div className="mt-auto pt-2">
                    <div className="rounded-2xl border border-border/60 bg-background/60 p-3 flex items-center justify-between gap-4">
                      {/* qty */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {isAr ? "الكمية" : "Qty"}
                        </span>
                        <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-card p-0.5 shadow-sm">
                          <button
                            type="button"
                            onClick={() => setQty((q) => Math.max(1, q - 1))}
                            className="grid size-7 place-items-center rounded-full text-sm transition hover:bg-muted"
                            aria-label="decrease"
                          >
                            −
                          </button>
                          <span className="min-w-6 text-center text-sm font-black tabular-nums">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQty((q) => Math.min(99, q + 1))}
                            className="grid size-7 place-items-center rounded-full text-sm transition hover:bg-muted"
                            aria-label="increase"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* total */}
                      {selected && (
                        <div className="flex min-w-0 flex-col items-end">
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {isAr ? "الإجمالي" : "Total"}
                          </span>
                          <span className="flex items-baseline gap-1.5">
                            {hasDiscount && !soldOut && (
                              <span className="text-[11px] text-muted-foreground line-through tabular-nums">
                                {Math.round(rawUnit * qty * 100) / 100}
                              </span>
                            )}
                            <span
                              className={`text-2xl font-black tabular-nums leading-none ${soldOut ? "text-destructive line-through" : "text-brand-deep"}`}
                            >
                              {soldOut ? t.product.soldOut : total}
                            </span>
                            {!soldOut && (
                              <span className="text-[10px] font-bold text-muted-foreground">
                                {t.common.currency}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
